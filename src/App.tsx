import React, { useState, useRef, useEffect } from 'react';
import { LiveProvider, LivePreview, LiveContext } from 'react-live';
import * as LucideIcons from 'lucide-react';
import { TransformWrapper, TransformComponent, useControls, useTransformContext } from 'react-zoom-pan-pinch';

const ErrorFixer = ({ onFix }: { onFix: (error: string) => void }) => {
  const live = React.useContext(LiveContext);
  if (!live?.error) return null;
  
  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 bg-red-900/90 text-red-200 font-mono text-sm overflow-auto max-h-48 z-50 flex flex-col gap-3">
      <div className="whitespace-pre-wrap">{live.error}</div>
      <button 
        onClick={(e) => {
          e.stopPropagation();
          onFix(live.error!);
        }}
        className="self-start px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-2 border border-red-600"
      >
        <LucideIcons.Wrench className="w-3.5 h-3.5" />
        Fix this error
      </button>
    </div>
  );
};

const ZoomControls = () => {
  const { zoomIn, zoomOut, resetTransform, centerView } = useControls();
  const { transformState } = useTransformContext();
  
  return (
    <div className="absolute top-4 right-4 z-10 flex items-center gap-1 bg-zinc-900/80 backdrop-blur-md p-1 rounded-lg border border-zinc-800 shadow-xl">
      <button 
        onClick={() => zoomOut()} 
        className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
        title="Zoom Out"
      >
        <LucideIcons.Minus className="w-4 h-4" />
      </button>
      <button 
        onClick={() => resetTransform()} 
        className="px-2 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors min-w-[3rem]"
        title="Reset Zoom"
      >
        {Math.round(transformState.scale * 100)}%
      </button>
      <button 
        onClick={() => zoomIn()} 
        className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
        title="Zoom In"
      >
        <LucideIcons.Plus className="w-4 h-4" />
      </button>
      <div className="w-px h-4 bg-zinc-700 mx-1" />
      <button 
        onClick={() => centerView()} 
        className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
        title="Fit to Screen"
      >
        <LucideIcons.Maximize className="w-4 h-4" />
      </button>
    </div>
  );
};
import { generateUI, AIProvider, APIKeys } from './services/gemini';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, TextInput, FlatList, SafeAreaView } from 'react-native';
import tw from 'twrnc';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Highlight, themes } from 'prism-react-renderer';
import { ErrorBoundary } from './components/ErrorBoundary';

const scope = { 
  React, 
  ...LucideIcons,
  useState: React.useState,
  useEffect: React.useEffect,
  useRef: React.useRef,
  useMemo: React.useMemo,
  useCallback: React.useCallback,
  useContext: React.useContext,
  useReducer: React.useReducer,
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, TextInput, FlatList, SafeAreaView,
  tw
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  targetElement?: string | null;
};

const PROVIDER_MODELS: Record<AIProvider, {id: string, name: string}[]> = {
  gemini: [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
    { id: 'gemini-3.1-flash-preview', name: 'Gemini 3.1 Flash' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }
  ],
  anthropic: [
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' }
  ],
  ollama: [
    { id: 'llama3', name: 'Llama 3' },
    { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder' },
    { id: 'mistral', name: 'Mistral' }
  ]
};

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Main Editor component for generating and editing React Native UI.
 * Handles chat interface, code generation, and live preview rendering.
 * 
 * @param props - Component properties
 * @param props.projectId - The unique identifier for the current project
 * @param props.onBack - Callback function to return to the project list
 * @param props.initialPrompt - Optional initial prompt to start generation immediately
 */
function Editor({ projectId, onBack, initialPrompt }: { projectId: string, onBack: () => void, initialPrompt?: string }) {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem(`stitch_${projectId}_messages`);
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [screens, setScreens] = useState<string[]>(() => {
    const saved = localStorage.getItem(`stitch_${projectId}_screens`);
    return saved ? JSON.parse(saved) : [];
  });
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [nextScreens, setNextScreens] = useState<string[]>(() => {
    const saved = localStorage.getItem(`stitch_${projectId}_nextScreens`);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [showSettings, setShowSettings] = useState(false);
  const [provider, setProvider] = useState<AIProvider>(() => {
    return (localStorage.getItem('stitch_provider') as AIProvider) || 'gemini';
  });
  const [model, setModel] = useState<string>(() => {
    return localStorage.getItem('stitch_model') || 'gemini-3.1-pro-preview';
  });
  const [apiKeys, setApiKeys] = useState<APIKeys>(() => {
    const saved = localStorage.getItem('stitch_apikeys');
    return saved ? JSON.parse(saved) : {};
  });

  const [isInspectMode, setIsInspectMode] = useState(false);
  const [selectedElementForEdit, setSelectedElementForEdit] = useState<string | null>(null);
  const [targetScreenIndex, setTargetScreenIndex] = useState<number | null>(null);
  const [replaceCurrent, setReplaceCurrent] = useState(true);
  const [toastError, setToastError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isMiddleMousePressed, setIsMiddleMousePressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        setIsMiddleMousePressed(true);
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 1) {
        setIsMiddleMousePressed(false);
      }
    };
    const handleBlur = () => {
      setIsSpacePressed(false);
      setIsMiddleMousePressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    if (toastError) {
      const timer = setTimeout(() => setToastError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastError]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  useEffect(() => {
    localStorage.setItem(`stitch_${projectId}_messages`, JSON.stringify(messages));
    
    const savedProjects = localStorage.getItem('stitch_projects');
    if (savedProjects) {
      const projects: Project[] = JSON.parse(savedProjects);
      const updatedProjects = projects.map(p => 
        p.id === projectId ? { ...p, updatedAt: Date.now() } : p
      );
      localStorage.setItem('stitch_projects', JSON.stringify(updatedProjects));
    }
  }, [messages, projectId]);

  useEffect(() => {
    localStorage.setItem(`stitch_${projectId}_screens`, JSON.stringify(screens));
  }, [screens, projectId]);

  useEffect(() => {
    localStorage.setItem(`stitch_${projectId}_nextScreens`, JSON.stringify(nextScreens));
  }, [nextScreens, projectId]);

  useEffect(() => {
    localStorage.setItem('stitch_provider', provider);
    if (provider !== 'ollama' && !PROVIDER_MODELS[provider].find(m => m.id === model)) {
      setModel(PROVIDER_MODELS[provider][0].id);
    } else if (provider === 'ollama' && !model) {
      setModel('llama3');
    }
  }, [provider]);

  useEffect(() => {
    localStorage.setItem('stitch_model', model);
  }, [model]);

  useEffect(() => {
    localStorage.setItem('stitch_apikeys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  useEffect(() => {
    if (initialPrompt && messages.length === 0) {
      handleSend(initialPrompt);
    }
  }, [initialPrompt]);

  const hoveredElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isInspectMode && hoveredElementRef.current) {
      hoveredElementRef.current.style.outline = '';
      hoveredElementRef.current.style.outlineOffset = '';
      hoveredElementRef.current.style.cursor = '';
      hoveredElementRef.current = null;
    }
  }, [isInspectMode]);

  const handleInspectMouseOver = (e: React.MouseEvent) => {
    if (!isInspectMode) return;
    e.stopPropagation();
    const target = e.target as HTMLElement;
    target.style.outline = '2px solid #6366f1';
    target.style.outlineOffset = '2px';
    target.style.cursor = 'crosshair';
    hoveredElementRef.current = target;
  };

  const handleInspectMouseOut = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    target.style.outline = '';
    target.style.outlineOffset = '';
    target.style.cursor = '';
    if (hoveredElementRef.current === target) {
      hoveredElementRef.current = null;
    }
  };

  const handleInspectClick = (e: React.MouseEvent, index: number) => {
    if (!isInspectMode) return;
    e.preventDefault();
    e.stopPropagation();
    
    const target = e.target as HTMLElement;
    target.style.outline = '';
    target.style.outlineOffset = '';
    target.style.cursor = '';
    
    let desc = target.tagName.toLowerCase();
    if (desc === 'path' || desc === 'svg') {
      desc = 'icon';
    } else if (desc === 'img') {
      desc = 'image';
    } else {
      const text = target.textContent?.trim();
      if (text && text.length < 50) {
        desc = `"${text}"`;
      } else if (text && text.length >= 50) {
        desc = `element containing text "${text.substring(0, 20)}..."`;
      } else {
        desc = 'selected area';
      }
    }
    
    setSelectedElementForEdit(desc);
    setTargetScreenIndex(index);
    setReplaceCurrent(true);
    setIsInspectMode(false);
    
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  const handleSend = async (textInput?: string) => {
    setIsInspectMode(false);
    const userMsg = typeof textInput === 'string' ? textInput : input;
    if (!userMsg.trim() || isGenerating) return;
    
    setInput('');
    
    const isEditMode = selectedElementForEdit !== null || userMsg.startsWith('[Editing:');
    let promptForAI = userMsg;
    if (selectedElementForEdit) {
      promptForAI = `[Editing: ${selectedElementForEdit}] ${userMsg}`;
    }

    setMessages(prev => [...prev, { role: 'user', content: userMsg, targetElement: selectedElementForEdit }]);
    setIsGenerating(true);
    
    try {
      let indexToEdit = targetScreenIndex !== null ? targetScreenIndex : (screens.length - 1);
      const previousCode = indexToEdit >= 0 ? screens[indexToEdit] : undefined;
      
      const result = await generateUI(promptForAI, previousCode, 0, provider, apiKeys, messages, model, isEditMode);
      
      setScreens(prev => {
        if (prev.length > 0 && replaceCurrent) {
          const newScreens = [...prev];
          const target = targetScreenIndex !== null && targetScreenIndex < newScreens.length ? targetScreenIndex : newScreens.length - 1;
          newScreens[target] = result.code;
          return newScreens;
        }
        return [...prev, result.code];
      });
      setTargetScreenIndex(null);
      setSelectedElementForEdit(null);
      
      let assistantMsg = 'I have generated a new screen based on your request.';
      if (result.plan) {
        assistantMsg = result.plan;
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: assistantMsg }]);
      setNextScreens(result.nextScreens || []);
      setActiveTab('preview');
    } catch (error: any) {
      console.error(error);
      setToastError(error.message || 'Sorry, an error occurred while generating the UI.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFixError = (errorMsg: string, index: number) => {
    setTargetScreenIndex(index);
    setReplaceCurrent(true);
    handleSend(`Fix this error:\n\n${errorMsg}`);
  };

  const handleDeleteScreen = (indexToDelete: number) => {
    if (targetScreenIndex !== null) {
      if (targetScreenIndex === indexToDelete) {
        setTargetScreenIndex(null);
      } else if (targetScreenIndex > indexToDelete) {
        setTargetScreenIndex(targetScreenIndex - 1);
      }
    }
    setScreens(prev => prev.filter((_, i) => i !== indexToDelete));
  };

  const formatCodeForExpo = (code: string) => {
    let formattedCode = code;
    
    // 1. Find the main component name from render(<Component />)
    const renderMatch = formattedCode.match(/render\(\s*<([A-Za-z0-9_]+)\s*\/?>(?:\s*<\/[A-Za-z0-9_]+>)?\s*\);?/);
    const mainComponent = renderMatch ? renderMatch[1] : 'App';
    
    // Remove the render() call
    formattedCode = formattedCode.replace(/render\(\s*<[A-Za-z0-9_]+\s*\/?>(?:\s*<\/[A-Za-z0-9_]+>)?\s*\);?/, '');
    
    // Replace lucide-react with lucide-react-native if it was imported
    formattedCode = formattedCode.replace(/from\s+['"]lucide-react['"]/g, "from 'lucide-react-native'");
    
    // 2. Extract used React Native components
    const rnComponents = [
      'View', 'Text', 'Image', 'ScrollView', 'TouchableOpacity', 'TextInput', 
      'FlatList', 'SafeAreaView', 'StyleSheet', 'Platform', 'Dimensions', 
      'Animated', 'Easing', 'KeyboardAvoidingView', 'Modal', 'Switch', 
      'ActivityIndicator', 'RefreshControl', 'SectionList', 'StatusBar', 
      'TouchableHighlight', 'TouchableWithoutFeedback', 'ImageBackground'
    ];
    
    const usedRnComponents = rnComponents.filter(comp => new RegExp(`\\b${comp}\\b`).test(formattedCode));
    
    // 3. Extract used Lucide icons
    const jsxTagMatches = [...formattedCode.matchAll(/<([A-Z][a-zA-Z0-9_]*)/g)];
    const usedTags = [...new Set(jsxTagMatches.map(m => m[1]))];
    
    const definedComponents = [...formattedCode.matchAll(/(?:const|function|class)\s+([A-Z][a-zA-Z0-9_]*)/g)].map(m => m[1]);
    const possibleIcons = usedTags.filter(tag => !rnComponents.includes(tag) && !definedComponents.includes(tag));
    
    // 4. Extract used React hooks
    const reactHooks = ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useReducer', 'useContext', 'useLayoutEffect'];
    const usedHooks = reactHooks.filter(hook => new RegExp(`\\b${hook}\\b`).test(formattedCode));
    
    // 5. Build imports
    let imports = '';
    if (!formattedCode.includes('import React')) {
      imports += `import React`;
      if (usedHooks.length > 0) {
        imports += `, { ${usedHooks.join(', ')} }`;
      }
      imports += ` from 'react';\n`;
    }
    
    if (usedRnComponents.length > 0 && !formattedCode.includes('react-native')) {
      imports += `import { ${usedRnComponents.join(', ')} } from 'react-native';\n`;
    }
    
    if (formattedCode.includes('tw`') && !formattedCode.includes('twrnc')) {
      imports += `import tw from 'twrnc';\n`;
    }
    
    if (possibleIcons.length > 0 && !formattedCode.includes('lucide-react-native')) {
      imports += `import { ${possibleIcons.join(', ')} } from 'lucide-react-native';\n`;
    }
    
    // 6. Strip the phone frame wrapper
    formattedCode = formattedCode.replace(/<View\s+style=\{\{\s*width:\s*375,\s*height:\s*812,\s*overflow:\s*['"]hidden['"],\s*backgroundColor:\s*['"]white['"],\s*borderRadius:\s*40,\s*borderWidth:\s*8,\s*borderColor:\s*['"]#18181b['"]\s*\}\}>/g, '<View style={tw`flex-1 bg-white`}>');
    
    // 7. Add export default
    if (!formattedCode.includes('export default')) {
      formattedCode = `${imports}\n${formattedCode.trim()}\n\nexport default ${mainComponent};\n`;
    } else {
      formattedCode = `${imports}\n${formattedCode.trim()}\n`;
    }
    
    return formattedCode;
  };

  const handleExport = async () => {
    const zip = new JSZip();
    screens.forEach((code, i) => {
      zip.file(`Screen${i + 1}.tsx`, formatCodeForExpo(code));
    });
    
    // Add a helpful README
    zip.file('README.md', `# Expo Export

These screens are ready to be used in your Expo project!

## Setup Instructions

1. Install the required dependencies in your Expo project:
\`\`\`bash
npx expo install twrnc lucide-react-native
\`\`\`

2. Copy the \`Screen*.tsx\` files into your project's components or screens directory.

3. Import and use them in your app!
`);

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'stitch-screens.zip');
  };

  const clearData = () => {
    if (confirm('Are you sure you want to clear all local data? This cannot be undone.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 flex flex-col bg-zinc-900/80 backdrop-blur-xl z-20 border-r border-white/5">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors mr-1">
              <LucideIcons.ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-semibold text-lg tracking-tight">openStitch</h1>
          </div>
          <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors">
            <LucideIcons.Settings className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {messages.length === 0 ? (
            <div className="text-center text-zinc-500 mt-10">
              <LucideIcons.LayoutTemplate className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Describe a mobile UI you want to build.</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`px-4 py-3 rounded-2xl max-w-[90%] text-sm whitespace-pre-wrap leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-500/90 text-white shadow-indigo-500/20 ring-1 ring-white/10' : 'bg-white/5 text-zinc-200 ring-1 ring-white/5 backdrop-blur-md'}`}>
                  {msg.targetElement && (
                    <div className="text-xs font-medium bg-black/20 px-2 py-1 rounded mb-2 flex items-center gap-1.5 w-fit">
                      <LucideIcons.Target className="w-3 h-3" />
                      {msg.targetElement}
                    </div>
                  )}
                  {msg.content}
                </div>
              </div>
            ))
          )}
          {isGenerating && (
            <div className="flex items-start">
              <div className="px-4 py-3 rounded-2xl bg-white/5 text-zinc-200 ring-1 ring-white/5 backdrop-blur-md flex items-center gap-3 text-sm">
                <LucideIcons.Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                Generating...
              </div>
            </div>
          )}
          {nextScreens.length > 0 && !isGenerating && (
            <div className="mt-4 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">Up Next:</h3>
              <div className="space-y-2">
                {nextScreens.map((screen, i) => (
                  <div key={i} className="flex items-center justify-between bg-zinc-800 p-3 rounded-lg border border-zinc-700">
                    <span className="text-sm text-zinc-200">{screen}</span>
                    <button
                      onClick={() => handleSend(`Build the ${screen} screen`)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-md transition-colors"
                    >
                      Build
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <div className="p-4 border-t border-white/5 bg-zinc-900/50">
          {screens.length > 0 && (
            <div className="flex items-center gap-4 mb-2">
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer w-max">
                <input 
                  type="checkbox" 
                  checked={replaceCurrent} 
                  onChange={e => setReplaceCurrent(e.target.checked)} 
                  className="rounded border-zinc-700 bg-zinc-800 text-indigo-600 focus:ring-indigo-500" 
                />
                {replaceCurrent ? 'Update screen' : 'Base on screen'}
              </label>
              <select
                value={targetScreenIndex !== null ? targetScreenIndex : screens.length - 1}
                onChange={e => setTargetScreenIndex(Number(e.target.value))}
                className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {screens.map((_, i) => (
                  <option key={i} value={i}>Screen {i + 1} {i === screens.length - 1 ? '(Latest)' : ''}</option>
                ))}
              </select>
            </div>
          )}
          {selectedElementForEdit && (
            <div className="flex items-center justify-between bg-indigo-900/40 border border-indigo-500/50 rounded-lg px-3 py-2 mb-2">
              <span className="text-indigo-200 text-xs font-medium flex items-center gap-2 truncate">
                <LucideIcons.Target className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Targeting: {selectedElementForEdit}</span>
              </span>
              <button 
                onClick={() => {
                  setSelectedElementForEdit(null);
                  setTargetScreenIndex(null);
                }} 
                className="text-indigo-400 hover:text-indigo-300 shrink-0 ml-2"
              >
                <LucideIcons.X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask openStitch to create a app ui that..."
              className="w-full bg-zinc-800/50 border border-white/10 rounded-2xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none h-24 backdrop-blur-md transition-all placeholder-zinc-500"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isGenerating}
              className="absolute right-3 bottom-3 p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-zinc-600 text-white rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-indigo-500/25 disabled:shadow-none disabled:hover:scale-100"
            >
              <LucideIcons.Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
        <div className="h-14 border-b border-white/5 flex items-center px-4 gap-2 bg-zinc-900/80 backdrop-blur-md z-20">
          <div className="flex bg-zinc-800/50 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'preview' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <LucideIcons.MonitorSmartphone className="w-4 h-4" />
              Canvas
            </button>
            <button
              onClick={() => { setActiveTab('code'); setIsInspectMode(false); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'code' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <LucideIcons.Code className="w-4 h-4" />
              Code
            </button>
          </div>
          {activeTab === 'preview' && (
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => setIsInspectMode(!isInspectMode)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${isInspectMode ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
              >
                <LucideIcons.Crosshair className="w-4 h-4" />
                {isInspectMode ? 'Select Element...' : 'Select to Edit'}
              </button>
            </div>
          )}
          {activeTab === 'preview' && (
            <div className="ml-auto text-xs text-zinc-500 flex items-center gap-2">
              <LucideIcons.MousePointer2 className="w-3 h-3" />
              {isInspectMode 
                ? 'Click any element on the screen to edit it.' 
                : 'Drag canvas or hold Space/Middle Click to pan, Ctrl+Scroll to zoom.'}
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-hidden relative">
          {screens.length > 0 ? (
            activeTab === 'preview' ? (
              <div 
                ref={gridRef}
                className={`w-full h-full overflow-hidden relative ${isSpacePressed || isMiddleMousePressed ? 'cursor-grab active:cursor-grabbing' : ''}`}
                style={{
                  backgroundImage: 'radial-gradient(#444 1px, transparent 0)',
                  backgroundSize: '24px 24px',
                  backgroundColor: '#1e1e1e',
                  backgroundPosition: '0px 0px'
                }}
              >
                <TransformWrapper
                  initialScale={0.8}
                  minScale={0.05}
                  maxScale={4}
                  centerOnInit={true}
                  wheel={{ step: 0.1, smoothStep: 0.005, activationKeys: ['Control', 'Meta'] }}
                  panning={{ wheelPanning: true, velocityDisabled: false, excluded: ['nodrag', 'pzp-no-pan'] }}
                  doubleClick={{ disabled: true }}
                  onTransformed={(ref, state) => {
                    if (gridRef.current) {
                      const { scale, positionX, positionY } = state;
                      gridRef.current.style.backgroundSize = `${24 * scale}px ${24 * scale}px`;
                      gridRef.current.style.backgroundPosition = `${positionX}px ${positionY}px`;
                    }
                  }}
                >
                  <ZoomControls />
                  <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                    <div className="flex items-center gap-16 p-32 min-w-max min-h-max">
                      {screens.map((code, index) => (
                        <div key={index} className="flex flex-col items-center gap-4">
                          <div className="flex items-center gap-3 bg-zinc-900/80 px-3 py-1 rounded-full border border-zinc-800">
                            <span className="text-zinc-500 font-mono text-sm font-medium">
                              Screen {index + 1} {index === screens.length - 1 && '(Latest)'}
                            </span>
                            <div className="flex items-center gap-1 ml-2">
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(formatCodeForExpo(code));
                                  setToastMessage('Expo code copied to clipboard!');
                                }} 
                                className="text-zinc-500 hover:text-indigo-400 transition-colors p-1" 
                                title="Copy Expo Code"
                              >
                                <LucideIcons.Copy className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteScreen(index)} 
                                className="text-zinc-500 hover:text-red-400 transition-colors p-1" 
                                title="Delete Screen"
                              >
                                <LucideIcons.Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div 
                            className={`${isSpacePressed || isMiddleMousePressed ? '' : 'nodrag pzp-no-pan'} relative flex flex-col`}
                            onMouseOverCapture={handleInspectMouseOver}
                            onMouseOutCapture={handleInspectMouseOut}
                            onClickCapture={(e) => handleInspectClick(e, index)}
                          >
                            <ErrorBoundary>
                              <LiveProvider code={code} scope={scope} noInline={true}>
                                <LivePreview className="flex flex-col" />
                                <ErrorFixer onFix={(err) => handleFixError(err, index)} />
                              </LiveProvider>
                            </ErrorBoundary>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TransformComponent>
                </TransformWrapper>
                {isGenerating && (
                  <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="bg-zinc-900 text-white px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl border border-zinc-800">
                      <LucideIcons.Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                      <span className="font-medium">Designing new screen...</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-full overflow-auto bg-zinc-950 p-6 space-y-8 relative">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium text-zinc-100">Generated Screens</h2>
                  <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md transition-colors text-sm">
                    <LucideIcons.Download className="w-4 h-4" />
                    Export All as ZIP
                  </button>
                </div>
                {screens.map((code, index) => (
                  <div key={index} className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-lg">
                    <div className="flex justify-between items-center px-4 py-3 bg-zinc-800/50 border-b border-zinc-800">
                      <span className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                        <LucideIcons.FileCode2 className="w-4 h-4 text-indigo-400" />
                        Screen {index + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(formatCodeForExpo(code));
                            setToastMessage('Expo code copied to clipboard!');
                          }}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-indigo-400 rounded-md transition-colors flex items-center gap-1"
                          title="Copy Expo Code"
                        >
                          <LucideIcons.Copy className="w-4 h-4" />
                          <span className="text-xs font-medium">Expo</span>
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(code);
                            setToastMessage('Raw code copied to clipboard!');
                          }}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-md transition-colors flex items-center gap-1"
                          title="Copy Raw Code"
                        >
                          <LucideIcons.Copy className="w-4 h-4" />
                          <span className="text-xs font-medium">Raw</span>
                        </button>
                        <button
                          onClick={() => handleDeleteScreen(index)}
                          className="p-1.5 bg-zinc-800 hover:bg-red-900/30 text-zinc-400 hover:text-red-400 rounded-md transition-colors"
                          title="Delete Screen"
                        >
                          <LucideIcons.Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="p-4 overflow-auto max-h-[500px] text-sm font-mono">
                      <Highlight theme={themes.vsDark} code={code} language="tsx">
                        {({ className, style, tokens, getLineProps, getTokenProps }) => (
                          <pre className={className} style={{...style, backgroundColor: 'transparent'}}>
                            {tokens.map((line, i) => (
                              <div key={i} {...getLineProps({ line })}>
                                <span className="inline-block w-8 text-zinc-600 select-none">{i + 1}</span>
                                {line.map((token, key) => (
                                  <span key={key} {...getTokenProps({ token })} />
                                ))}
                              </div>
                            ))}
                          </pre>
                        )}
                      </Highlight>
                    </div>
                  </div>
                ))}
                {isGenerating && (
                  <div className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="bg-zinc-800 text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-xl border border-zinc-700">
                      <LucideIcons.Loader2 className="w-4 h-4 animate-spin" />
                      Updating Code...
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            <div 
              className="w-full h-full flex items-center justify-center text-zinc-500"
              style={{
                backgroundImage: 'radial-gradient(#333 1px, transparent 0)',
                backgroundSize: '24px 24px',
                backgroundColor: '#1e1e1e'
              }}
            >
              <div className="text-center bg-zinc-900/80 p-8 rounded-2xl border border-zinc-800 backdrop-blur-sm">
                <LucideIcons.MonitorSmartphone className="w-16 h-16 mx-auto mb-4 text-zinc-600" />
                <p className="text-lg font-medium text-zinc-300">Infinite Canvas Ready</p>
                <p className="text-sm mt-2">Describe a mobile screen to start designing</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <LucideIcons.Settings className="w-5 h-5" />
                Settings
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-white">
                <LucideIcons.X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">AI Provider</label>
                <select 
                  value={provider} 
                  onChange={e => setProvider(e.target.value as AIProvider)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Model</label>
                {provider === 'ollama' ? (
                  <input 
                    type="text"
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    placeholder="e.g. llama3, mistral, qwen2.5-coder"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <select 
                    value={model} 
                    onChange={e => setModel(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {PROVIDER_MODELS[provider].map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  {provider === 'gemini' ? 'Gemini API Key' : provider === 'openai' ? 'OpenAI API Key' : provider === 'anthropic' ? 'Anthropic API Key' : 'Ollama URL'}
                </label>
                <input 
                  type="password"
                  value={provider === 'ollama' ? (apiKeys.ollamaUrl || '') : (apiKeys[provider] || '')}
                  onChange={e => setApiKeys(prev => ({ ...prev, [provider === 'ollama' ? 'ollamaUrl' : provider]: e.target.value }))}
                  placeholder={provider === 'ollama' ? 'http://localhost:11434' : `Enter your ${provider} key...`}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-zinc-500 mt-2">
                  {provider === 'ollama' ? 'Ensure Ollama is running locally and CORS is configured.' : 'Keys are stored locally in your browser. If left blank for Gemini, it will use the default environment key.'}
                </p>
              </div>
            </div>
            
            <div className="mt-8 flex justify-end gap-3">
              <button onClick={clearData} className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 mr-auto">
                Clear Data
              </button>
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastError && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 max-w-md animate-in slide-in-from-bottom-5">
          <LucideIcons.AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{toastError}</p>
          <button onClick={() => setToastError(null)} className="p-1 hover:bg-red-600 rounded-md transition-colors ml-auto">
            <LucideIcons.X className="w-4 h-4" />
          </button>
        </div>
      )}
      
      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 max-w-md animate-in slide-in-from-bottom-5">
          <LucideIcons.CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{toastMessage}</p>
          <button onClick={() => setToastMessage(null)} className="p-1 hover:bg-emerald-700 rounded-md transition-colors ml-auto">
            <LucideIcons.X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Root Application component.
 * Manages the project list, global settings, and routing between the dashboard and the editor.
 */
export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('stitch_projects');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [initialPrompt, setInitialPrompt] = useState('');
  
  const [showSettings, setShowSettings] = useState(false);
  const [provider, setProvider] = useState<AIProvider>(() => {
    return (localStorage.getItem('stitch_provider') as AIProvider) || 'gemini';
  });
  const [model, setModel] = useState<string>(() => {
    return localStorage.getItem('stitch_model') || 'gemini-3.1-pro-preview';
  });
  const [apiKeys, setApiKeys] = useState<APIKeys>(() => {
    const saved = localStorage.getItem('stitch_apikeys');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('stitch_provider', provider);
    if (provider !== 'ollama' && !PROVIDER_MODELS[provider].find(m => m.id === model)) {
      setModel(PROVIDER_MODELS[provider][0].id);
    } else if (provider === 'ollama' && !model) {
      setModel('llama3');
    }
  }, [provider]);

  useEffect(() => {
    localStorage.setItem('stitch_model', model);
  }, [model]);

  useEffect(() => {
    localStorage.setItem('stitch_apikeys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  const handleNewProject = (prompt: string) => {
    const newProject: Project = {
      id: Date.now().toString(),
      name: prompt.slice(0, 30) + (prompt.length > 30 ? '...' : ''),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updatedProjects = [newProject, ...projects];
    setProjects(updatedProjects);
    localStorage.setItem('stitch_projects', JSON.stringify(updatedProjects));
    setInitialPrompt(prompt);
    setCurrentProjectId(newProject.id);
  };

  const handleOpenProject = (id: string) => {
    setInitialPrompt('');
    setCurrentProjectId(id);
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedProjects = projects.filter(p => p.id !== id);
    setProjects(updatedProjects);
    localStorage.setItem('stitch_projects', JSON.stringify(updatedProjects));
    localStorage.removeItem(`stitch_${id}_messages`);
    localStorage.removeItem(`stitch_${id}_screens`);
    localStorage.removeItem(`stitch_${id}_nextScreens`);
  };

  if (currentProjectId) {
    return <Editor projectId={currentProjectId} onBack={() => setCurrentProjectId(null)} initialPrompt={initialPrompt} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Top Navigation */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-end z-20">
        <button 
          className="p-2.5 rounded-full bg-zinc-900/80 border border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white transition-all backdrop-blur-md shadow-lg"
          onClick={() => setShowSettings(true)}
          title="Settings & API Keys"
        >
          <LucideIcons.Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Background gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full mix-blend-screen"></div>
        <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/20 blur-[120px] rounded-full mix-blend-screen"></div>
        <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[60%] bg-pink-600/20 blur-[120px] rounded-full mix-blend-screen"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-600/20 blur-[120px] rounded-full mix-blend-screen"></div>
      </div>

      <div className="z-10 w-full max-w-3xl px-6 flex flex-col items-center">
        <h1 className="text-5xl font-bold mb-4 tracking-tight text-center">Build something | openStitch</h1>
        <p className="text-lg text-zinc-300 mb-12 text-center">Create apps designs by chatting with AI</p>

        <div className="w-full bg-zinc-900/80 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 shadow-2xl flex flex-col gap-4 transition-all focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500/30">
          <textarea
            className="w-full bg-transparent text-white placeholder-zinc-500 resize-none outline-none px-2 text-lg min-h-[80px] font-medium"
            placeholder="Ask openStitch to create a app ui that..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (e.currentTarget.value.trim()) {
                  handleNewProject(e.currentTarget.value);
                }
              }
            }}
          />
          <div className="flex justify-end items-center px-2">
            <button 
              className="p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white transition-all hover:scale-105 active:scale-95 shadow-lg shadow-indigo-500/25"
              onClick={(e) => {
                const textarea = e.currentTarget.parentElement?.parentElement?.querySelector('textarea');
                if (textarea && textarea.value.trim()) {
                  handleNewProject(textarea.value);
                }
              }}
            >
              <LucideIcons.ArrowUp className="w-5 h-5" />
            </button>
          </div>
        </div>

        {projects.length > 0 && (
          <div className="w-full mt-16">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 px-2">Recent Projects</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {projects.map(project => (
                <div 
                  key={project.id}
                  onClick={() => handleOpenProject(project.id)}
                  className="bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 p-4 rounded-2xl cursor-pointer transition-all group flex flex-col"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium text-zinc-200 line-clamp-2">{project.name}</h3>
                    <button 
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <LucideIcons.Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <span className="text-xs text-zinc-500 mt-auto">
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <LucideIcons.Settings className="w-5 h-5" />
                Settings
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-white">
                <LucideIcons.X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">AI Provider</label>
                <select 
                  value={provider} 
                  onChange={e => setProvider(e.target.value as AIProvider)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Model</label>
                {provider === 'ollama' ? (
                  <input 
                    type="text"
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    placeholder="e.g. llama3, mistral, qwen2.5-coder"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <select 
                    value={model} 
                    onChange={e => setModel(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {PROVIDER_MODELS[provider].map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  {provider === 'gemini' ? 'Gemini API Key' : provider === 'openai' ? 'OpenAI API Key' : provider === 'anthropic' ? 'Anthropic API Key' : 'Ollama URL'}
                </label>
                <input 
                  type="password"
                  value={provider === 'ollama' ? (apiKeys.ollamaUrl || '') : (apiKeys[provider] || '')}
                  onChange={e => setApiKeys(prev => ({ ...prev, [provider === 'ollama' ? 'ollamaUrl' : provider]: e.target.value }))}
                  placeholder={provider === 'ollama' ? 'http://localhost:11434' : `Enter your ${provider} key...`}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-zinc-500 mt-2">
                  {provider === 'ollama' ? 'Ensure Ollama is running locally and CORS is configured.' : 'Keys are stored locally in your browser. If left blank for Gemini, it will use the default environment key.'}
                </p>
              </div>
            </div>
            
            <div className="mt-8 flex justify-end gap-3">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
