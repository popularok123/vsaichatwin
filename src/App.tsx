import React, { useState,useEffect } from 'react';
import './App.css';
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm';
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { CopyToClipboard } from 'react-copy-to-clipboard';

const App: React.FC = () => {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [copiedMap, setCopiedMap] = useState<{ [key: string]: boolean }>({});
  const [isSending, setIsSending] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  useEffect(() => {
    window.handleSend = handleSend;
    window.initializeParams = initializeParams;
    window.setTheme = setTheme;
    window.messageSend = messageSend;
  }, []);

  const handleCopy = (messageIndex: number, codeIndex: number) => {
    const key = `${messageIndex}-${codeIndex}`;
    setCopiedMap(prevState => ({
      ...prevState,
      [key]: true
    }));

    setTimeout(() => {
      setCopiedMap(prevState => ({
        ...prevState,
        [key]: false
      }));
    }, 2000); // Reset after 2 seconds
  };

  const messageSend = async (sysmessage:string,input: string) =>
  {
    console.log('messageSend:', sysmessage, input);
    if (input.trim()&& !isSending) {

      clearMessages();
      setIsSending(true);
      const controller = new AbortController();
      setAbortController(controller);
      
      try {

        let url =`${window.baseurl}/v1/chat/completions`;
        let akey = `Bearer ${window.apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': akey
          },
          body: JSON.stringify({
            model: window.model,
            messages: [
              {
                role: 'system',
                content: sysmessage
              },
              {
                role: 'user',
                content: input
              }],
              stream: true
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let responseText = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
         const buff= decoder.decode(value, { stream: true });
             // Split the buffer by 'data:'
          const chunks = buff.split('data:');

          for (const chunk of chunks) {
            let v = chunk.trim();
            if (v.includes('data:')) {
              v = v.replace('data:', '').trim();
            }
            if (v.includes('[DONE]')) {
              v = v.replace('[DONE]', '').trim();
            }
              if (v)
              {
                try {
                  console.log('Parsing JSON:', v);
                  const jsonData = JSON.parse(v);
                  if (jsonData.choices && jsonData.choices.length > 0) {
                    const delta = jsonData.choices[0].delta;
                    if (delta && delta.content) {
                      responseText += delta.content;
                      //setMessages([...messages, responseText]);
                     setMessages(() => [responseText]);
                    }
                  }
                }
                catch (error) {
                  console.error('Error parsing JSON:', error,v);
                }
              }
            }
          }
        }
      } catch (error) {

        if (error === 'AbortError') {
          console.log('Fetch aborted');
        } else {
          console.error('Error sending message to deepseek:', error);
          setMessages([...messages, 'Failed to send message']);
          //setMessages((prevMessages) => [...prevMessages, 'Failed to send message']);
        }
      }
      finally {
        setIsSending(false);
        setAbortController(null);
        setInput('');
      }
    }
  };

  const initializeParams = (model: string, apiKey: string,baseurl: string) => {
    window.model = model;
    window.apiKey = apiKey;
    window.baseurl = baseurl;

    console.log('initializeParams:', model, apiKey,baseurl);
  };

  const setTheme = (backgroundColor: string, font: string,fontColor: string) => {
    document.body.style.backgroundColor = backgroundColor;
    document.body.style.fontFamily = font;
    document.body.style.color = fontColor; // 设置字体颜色
    console.log(`Applying theme: BackgroundColor=${backgroundColor}, Font=${font}, FontColor=${fontColor}`);
  };

  const clearMessages = () => {
    setMessages([]);
  };

  const handleSend = async (input: string) => {
    messageSend('You are a helpful assistant.', input,);
  };

  const handleAbort = () => {
    if (abortController) {
      abortController.abort();
    }
  };
  

  const renderers = {
    code({ node, inline, className, children, ...props }: CodeProps) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      const codeText = String(children).replace(/\n$/, '');
      const codeBlocks = messages.reduce((acc, msg, msgIndex) => {
        const codeBlockMatches = msg.match(/```[\s\S]*?```/g);
        if (codeBlockMatches) {
          codeBlockMatches.forEach((codeBlock, codeIndex) => {
            acc.push({ msgIndex, codeIndex, codeBlock });
          });
        }
        return acc;
      }, [] as { msgIndex: number, codeIndex: number, codeBlock: string }[]);

      const codeBlockIndex = codeBlocks.findIndex(cb => cb.codeBlock.includes(codeText));
      const key = codeBlockIndex !== -1 ? `${codeBlocks[codeBlockIndex].msgIndex}-${codeBlocks[codeBlockIndex].codeIndex}` : '';
      return !inline && match ? (
        <div className="code-block">
        <SyntaxHighlighter
          {...props}
          PreTag="div"
          children={String(children).replace(/\n$/, '')}
          language={language}
          style={oneDark}
        />
      <CopyToClipboard text={codeText} onCopy={() => handleCopy(codeBlocks[codeBlockIndex].msgIndex, codeBlocks[codeBlockIndex].codeIndex)}>
            <button className="copy-button">Copy</button>
          </CopyToClipboard>
          {copiedMap[key] && <span className="copy-feedback">Copied!</span>}
       </div>
      ) : (
        <code {...props} className={className}>
          {children}
        </code>
      );
    },
  };

  return (
    <div className="App">
      <div className="chat-window">
        {messages.map((msg, index) => (
          <div key={index} className="message">
            <ReactMarkdown  remarkPlugins={[remarkGfm]} components={renderers}>
              {msg}
            </ReactMarkdown>
          </div>
          
        ))}
      </div>
      <div className="input-container">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me more"
          className="input-field"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isSending) {
            // 检查是否按下 Ctrl 或 Cmd 键
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault(); // 阻止默认行为

              const textarea = e.currentTarget;
              const start = textarea.selectionStart;
              const end = textarea.selectionEnd;
              const textBefore = input.slice(0, start);
              const textAfter = input.slice(end);

              // 插入换行符
              const newValue = textBefore + '\n' + textAfter;
              setInput(newValue);

              // 移动光标到换行符之后的位置
              setTimeout(() => {
                textarea.setSelectionRange(start + 1, start + 1);
              }, 0);
            } else {
              // 如果没有按下 Ctrl 或 Cmd 键，则发送消息
              handleSend(input);
            }
          }
        }}
          disabled={isSending}
         />
        <div className="button-container">
      {isSending ? (
        <button onClick={handleAbort} className="abort-button">
          Abort
        </button>
        ) : (
        <button
          onClick={() => handleSend(input)}
          className="send-button"
          disabled={isSending}
        >
        Enter
      </button>  )}
      </div>
      </div>
    </div>
  );
};



interface CodeProps {
  node?: any,
  inline?: any,
  className?: any,
  children?: any,
}

declare global {
  interface Window {
    handleSend?: (input: string) => void; // 定义 handleSend 方法的类型
    messageSend?: (sysmessage:string, input: string) => void;
    initializeParams? : (model: string, apiKey: string,baseurl: string) =>void;
    setTheme? : (backgroundColor: string, font: string,fontColor: string) =>void;
    model: string;
    apiKey: string;
    baseurl: string;
    chrome?: {
      webview?: {
        hostObjects?: {
          ScriptBridge?: {
            Model:string;
            ApiKey:string;
            BaseUrl:string;
          };
        };
      };
    };
  }
}

export default App;