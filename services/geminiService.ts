import { GoogleGenAI, GenerateContentResponse, Modality } from '@google/genai';
import { ChatMessage } from '../types';

// Global AudioContext and related states for TTS playback
let _outputAudioContext: AudioContext | null = null;
let _outputNode: GainNode | null = null;
let nextStartTime = 0; // Tracks when the next audio chunk should start
const _sources = new Set<AudioBufferSourceNode>(); // Tracks active audio sources

/**
 * Initializes the Google Gemini API client.
 * The API key is assumed to be provided via process.env.API_KEY.
 * @returns An instance of GoogleGenAI or null if API key is missing.
 */
function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.API_KEY) {
    console.error('Gemini API key is not set. Cannot initialize client.');
    return null;
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
}

/**
 * Base64 decodes a string into a Uint8Array.
 * @param base64 The base64 encoded string.
 * @returns The decoded Uint8Array.
 */
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes raw PCM audio data into an AudioBuffer.
 * @param data The raw PCM data as a Uint8Array.
 * @param ctx The AudioContext.
 * @param sampleRate The sample rate of the PCM data.
 * @param numChannels The number of audio channels.
 * @returns A promise that resolves to the decoded AudioBuffer.
 */
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Generates a summary of the provided chat messages using the Gemini API.
 * @param messages An array of ChatMessage objects to summarize.
 * @returns A promise that resolves to the generated summary string.
 */
export async function summarizeChat(messages: ChatMessage[]): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) {
    console.error('Summarization failed: Gemini API client not initialized due to missing API key.');
    return 'Error: Gemini API key not available.';
  }

  const chatHistory = messages.map(msg => `${msg.author}: ${msg.text}`).join('\n');

  const prompt = `You are a helpful assistant that summarizes chat conversations. Provide a concise summary of the following chat messages:\n\n${chatHistory}\n\nSummary:`;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Use gemini-2.5-flash for basic text tasks like summarization
      contents: prompt,
      config: {
        systemInstruction: 'You are a chat summarization AI.',
        temperature: 0.5,
        maxOutputTokens: 200, // Limit summary length
        thinkingConfig: { thinkingBudget: 100 },
      },
    });

    // Check if the response contains text and return it
    if (response.text) {
      return response.text.trim();
    } else {
      console.warn('Gemini API returned an empty text response for summarization.');
      return 'Could not generate summary.';
    }
  } catch (error) {
    console.error('Error generating summary from Gemini API:', error);
    throw new Error(`Failed to generate summary: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generates speech from text using the Gemini TTS API and plays it.
 * @param textToSpeak The text to convert to speech.
 */
export async function generateSpeechFromText(textToSpeak: string): Promise<void> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('TTS failed: Gemini API client not initialized due to missing API key.');
  }

  stopSpeech(); // Stop any currently playing audio

  // Initialize AudioContext if not already done
  if (!_outputAudioContext) {
    _outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    _outputNode = _outputAudioContext.createGain();
    _outputNode.connect(_outputAudioContext.destination);
    nextStartTime = 0; // Reset start time for new session
  }

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: textToSpeak }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // Choose a suitable voice
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (base64Audio && _outputAudioContext && _outputNode) {
      nextStartTime = Math.max(nextStartTime, _outputAudioContext.currentTime);

      const audioBuffer = await decodeAudioData(
        decode(base64Audio),
        _outputAudioContext,
        24000, // Sample rate for Gemini TTS output
        1, // Number of channels for Gemini TTS output
      );

      const source = _outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(_outputNode);

      source.addEventListener('ended', () => {
        _sources.delete(source);
        if (_sources.size === 0) {
          nextStartTime = 0; // Reset nextStartTime if all sources have finished
        }
      });

      source.start(nextStartTime);
      nextStartTime = nextStartTime + audioBuffer.duration;
      _sources.add(source);
    } else {
      throw new Error('No audio data received from Gemini TTS.');
    }
  } catch (error) {
    console.error('Error generating speech from Gemini API:', error);
    stopSpeech(); // Ensure clean state on error
    throw new Error(`Failed to generate speech: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Stops any currently playing speech.
 */
export function stopSpeech(): void {
  for (const source of _sources.values()) {
    try {
      source.stop();
    } catch (e) {
      console.warn("Error stopping audio source:", e);
    }
  }
  _sources.clear();
  nextStartTime = 0; // Reset nextStartTime on stop
}

/**
 * Closes the global AudioContext and associated resources.
 */
export function closeAudioContext(): void {
  if (_outputAudioContext) {
    stopSpeech(); // Stop any playing audio before closing
    _outputAudioContext.close().then(() => {
      console.log('AudioContext closed.');
      _outputAudioContext = null;
      _outputNode = null;
      nextStartTime = 0;
    }).catch(e => {
      console.error('Error closing AudioContext:', e);
    });
  }
}
