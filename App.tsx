import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChatMessage,
  MessageSource,
  DisplayMessage,
  GeminiSummaryMessage,
} from './types';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import { summarizeChat, closeAudioContext } from './services/geminiService'; // Import closeAudioContext

const SUMMARY_INTERVAL_SECONDS = 60; // Summarize every 60 seconds
const MAX_DISPLAY_MESSAGES = 200; // Limit total messages displayed
const MAX_BUFFER_MESSAGES = 200; // Limit messages held in buffer for summarization

function App() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const chatMessagesBuffer = useRef<ChatMessage[]>([]); // Buffer for messages to be summarized

  // Callback to add new messages to the display and buffer
  const handleNewMessage = useCallback((message: ChatMessage) => {
    setMessages((prevMessages) => {
      // Limit messages to avoid excessive memory usage
      const newMessages = [...prevMessages, message];
      return newMessages.slice(-MAX_DISPLAY_MESSAGES); // Keep only the latest N messages
    });
    chatMessagesBuffer.current.push(message);
    // Optionally clear buffer if it gets too large, but still summarize
    if (chatMessagesBuffer.current.length > MAX_BUFFER_MESSAGES) {
      chatMessagesBuffer.current = chatMessagesBuffer.current.slice(-MAX_BUFFER_MESSAGES / 2); // Keep last half
    }
  }, []);

  // Effect for overall app cleanup (AudioContext)
  useEffect(() => {
    return () => {
      // Ensure AudioContext is closed on component unmount
      closeAudioContext();
    };
  }, []); // Empty dependency array means this runs once on mount and cleanup on unmount

  // Function to summarize chat
  const generateSummary = useCallback(async () => {
    if (chatMessagesBuffer.current.length === 0) {
      console.log('No new messages to summarize.');
      return;
    }

    setIsSummarizing(true);
    const messagesToSummarize = [...chatMessagesBuffer.current]; // Take a snapshot
    chatMessagesBuffer.current = []; // Clear buffer after taking snapshot

    try {
      const summaryText = await summarizeChat(messagesToSummarize);
      const summaryMessage: GeminiSummaryMessage = {
        id: `gemini-summary-${Date.now()}`,
        source: MessageSource.GEMINI_SUMMARY,
        summary: summaryText,
        timestamp: new Date(),
      };
      setMessages((prevMessages) => [...prevMessages, summaryMessage].slice(-MAX_DISPLAY_MESSAGES));
    } catch (error) {
      console.error('Failed to generate chat summary:', error);
      const errorMessage: GeminiSummaryMessage = {
        id: `gemini-error-${Date.now()}`,
        source: MessageSource.GEMINI_SUMMARY,
        summary: `Error: Failed to generate summary. ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
      };
      setMessages((prevMessages) => [...prevMessages, errorMessage].slice(-MAX_DISPLAY_MESSAGES));
    } finally {
      setIsSummarizing(false);
    }
  }, []);

  // Effect for periodic summarization
  useEffect(() => {
    const intervalId = setInterval(() => {
      generateSummary();
    }, SUMMARY_INTERVAL_SECONDS * 1000);

    return () => clearInterval(intervalId);
  }, [generateSummary]); // generateSummary is stable due to useCallback

  const handleManualSendMessage = (text: string) => {
    const newMessage: ChatMessage = {
      id: `manual-${Date.now()}`,
      source: MessageSource.MANUAL,
      author: 'You',
      text: text,
      timestamp: new Date(),
    };
    handleNewMessage(newMessage);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const lines = content.split('\n').filter(line => line.trim() !== '');

        const newUploadedMessages: ChatMessage[] = lines.map((line, index) => ({
          id: `uploaded-${Date.now()}-${index}`,
          source: MessageSource.UPLOADED,
          author: 'Uploaded User', // Generic author for uploaded logs
          text: line.trim(),
          timestamp: new Date(),
        }));

        // Batch update: add all uploaded messages in a single state update
        setMessages((prevMessages) => {
          const combinedMessages = [...prevMessages, ...newUploadedMessages];
          return combinedMessages.slice(-MAX_DISPLAY_MESSAGES);
        });

        // Batch update for the buffer
        chatMessagesBuffer.current.push(...newUploadedMessages);
        if (chatMessagesBuffer.current.length > MAX_BUFFER_MESSAGES) {
          chatMessagesBuffer.current = chatMessagesBuffer.current.slice(-MAX_BUFFER_MESSAGES / 2);
        }

        console.log(`Uploaded ${newUploadedMessages.length} messages from ${file.name}`);
      };
      reader.onerror = (e) => {
        console.error('Error reading file:', e);
        setUploadedFileName(null);
        alert('Failed to read file.');
      };
      reader.readAsText(file);
    }
  };


  return (
    <div className="flex flex-col h-[90vh] w-full max-w-4xl bg-gray-900 rounded-lg shadow-xl overflow-hidden">
      <header className="bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-500">Chat Cast Studio</h1>
        <div className="flex items-center space-x-2">
          {isSummarizing && (
            <span className="text-sm text-yellow-500 animate-pulse">Summarizing...</span>
          )}
          <span className="text-sm text-gray-500 flex items-center">
            <span className="h-2 w-2 rounded-full bg-gray-500 mr-1"></span>
            Offline
          </span>
        </div>
      </header>

      <div className="p-4 bg-gray-900">
        {/* File Upload Section */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-md mb-4 flex flex-col sm:flex-row gap-3 items-center">
          <label htmlFor="file-upload" className="flex-1 w-full sm:w-auto cursor-pointer bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-5 rounded-md shadow-md text-center focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900">
            <input id="file-upload" type="file" accept=".txt" onChange={handleFileUpload} className="hidden" />
            <span className="flex items-center justify-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
              Upload Chat Log (.txt)
            </span>
          </label>
          {uploadedFileName && (
            <span className="text-gray-400 text-sm ml-2 truncate">File: {uploadedFileName}</span>
          )}
        </div>
      </div>


      <ChatWindow messages={messages} />

      <div className="p-4 bg-gray-800 border-t border-gray-700">
        <ChatInput onSendMessage={handleManualSendMessage} disabled={isSummarizing} />
        <button
          onClick={generateSummary}
          className="w-full mt-3 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isSummarizing || chatMessagesBuffer.current.length === 0}
        >
          {isSummarizing ? 'Generating Summary...' : `Generate Summary (${chatMessagesBuffer.current.length} messages)`}
        </button>
      </div>
    </div>
  );
}

export default App;
