import React, { useEffect, useRef, useState } from 'react';
import { DisplayMessage, MessageSource, GeminiSummaryMessage } from '../types';
import { generateSpeechFromText, stopSpeech } from '../services/geminiService'; // Import TTS functions

interface ChatWindowProps {
  messages: DisplayMessage[];
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [speakingSummaryId, setSpeakingSummaryId] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<{ id: string; message: string } | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSpeakSummary = async (summaryMessage: GeminiSummaryMessage) => {
    setTtsError(null); // Clear previous errors
    if (speakingSummaryId === summaryMessage.id) {
      stopSpeech();
      setSpeakingSummaryId(null);
      return;
    }

    setSpeakingSummaryId(summaryMessage.id);
    try {
      await generateSpeechFromText(summaryMessage.summary);
      // TTS library might not have a direct 'onended' event to hook into React state
      // For simplicity, we assume it's done after starting, or you'd need a more
      // sophisticated state management linked to the AudioBufferSourceNode's 'onended'.
      // For now, let's keep it in 'speaking' state until manually stopped or a new one starts.
    } catch (error) {
      console.error('TTS failed:', error);
      setTtsError({ id: summaryMessage.id, message: `Failed to speak: ${error instanceof Error ? error.message : String(error)}` });
      stopSpeech(); // Ensure audio is stopped on error
      setSpeakingSummaryId(null);
    } finally {
      // If the audio context ends naturally, this state needs to be cleared
      // This part would need a more direct hook from `generateSpeechFromText`
      // For this example, it stays active until another speak command or manual stop
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-800 p-4 rounded-lg shadow-inner custom-scrollbar">
      {messages.length === 0 ? (
        <div className="text-gray-400 text-center py-8">No messages yet. Upload a log or send a manual message!</div>
      ) : (
        messages.map((msg) => {
          if (msg.source === MessageSource.GEMINI_SUMMARY) {
            const summaryMsg = msg;
            const isSpeaking = speakingSummaryId === summaryMsg.id;
            const currentError = ttsError?.id === summaryMsg.id ? ttsError.message : null;

            return (
              <div key={summaryMsg.id} className="mb-3 p-3 bg-indigo-900 bg-opacity-70 rounded-lg shadow-md border border-indigo-700">
                <div className="flex items-center justify-between text-sm text-indigo-300 mb-1">
                  <span className="font-bold mr-2">{summaryMsg.source} AI</span>
                  <span className="text-xs text-indigo-400 opacity-80">{summaryMsg.timestamp.toLocaleTimeString()}</span>
                </div>
                <p className="text-indigo-100 leading-relaxed text-base mb-2">{summaryMsg.summary}</p>
                <div className="flex items-center justify-end">
                  {currentError && (
                    <span className="text-red-400 text-xs mr-2">{currentError}</span>
                  )}
                  <button
                    onClick={() => handleSpeakSummary(summaryMsg)}
                    className="flex items-center px-3 py-1 bg-indigo-700 hover:bg-indigo-600 text-indigo-100 text-xs font-semibold rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isSpeaking && ttsError === null} // Disable if currently speaking this summary (unless there's an error)
                    aria-label={isSpeaking ? "Stop Speaking Summary" : "Speak Summary"}
                  >
                    {isSpeaking ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Stopping...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.616 17.158A1 1 0 0113.197 16.7L15 15.197a6.002 6.002 0 000-10.394L13.197 3.3a1 1 0 011.419-.458 8.001 8.001 0 010 14.316z" clipRule="evenodd"></path></svg>
                        Speak
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          } else {
            const chatMsg = msg;
            const isUploaded = chatMsg.source === MessageSource.UPLOADED;
            // No Twitch, so only differentiate between Uploaded and Manual
            const authorColor = isUploaded ? 'text-yellow-400' : 'text-blue-400';
            const bgColor = isUploaded ? 'bg-yellow-900 bg-opacity-30' : 'bg-blue-900 bg-opacity-30';
            const borderColor = isUploaded ? 'border-yellow-800' : 'border-blue-800';

            return (
              <div key={chatMsg.id} className={`mb-2 p-2 ${bgColor} rounded-md shadow-sm border ${borderColor}`}>
                <div className="flex items-center text-sm mb-0.5">
                  <span className={`font-semibold mr-2 ${authorColor}`}>{chatMsg.author} ({chatMsg.source})</span>
                  <span className="text-xs text-gray-500">{chatMsg.timestamp.toLocaleTimeString()}</span>
                </div>
                <p className="text-gray-200 break-words">{chatMsg.text}</p>
              </div>
            );
          }
        })
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatWindow;