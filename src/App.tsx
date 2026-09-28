import { useState } from 'react';
import { 
  MessageSquare, UserCircle2, Bot, Send, User, 
  Settings, CheckCheck, Clock, Search, Bell, Menu, Sparkles, BookOpen, Database, X, MessageCircle
} from 'lucide-react';
import { supabase } from './supabase';

const MOCK_CONVERSATIONS = [
  { id: 1, name: 'Juan Pérez', phone: '+54 9 11 1234-5678', status: 'Nueva', lastMessage: 'Hola, quisiera saber...', mode: 'AI_SUGGEST', time: '10:32 AM', unread: 2 },
  { id: 2, name: '', phone: '+54 9 11 8765-4321', status: 'Esperando operador', lastMessage: 'Necesito hablar con un humano', mode: 'HUMAN', time: '10:15 AM', unread: 0 },
  { id: 3, name: 'Pedro Rodríguez', phone: '+54 9 11 3333-4444', status: 'Atendida', lastMessage: 'Gracias por la información', mode: 'CLOSED', time: 'Ayer', unread: 0 },
];

export default function App() {
  const [activeView, setActiveView] = useState('chat'); // 'chat' or 'knowledge'
  const [activeConv, setActiveConv] = useState(MOCK_CONVERSATIONS[0]);
  const [replyText, setReplyText] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState("¡Hola Juan! Claro, podemos enviarte el precio. ¿Para qué fechas buscas alojamiento?");
  
  // Knowledge Base State
  const [knowledgeText, setKnowledgeText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  
  // Test Bot Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testMessages, setTestMessages] = useState<{role: string, content: string, isLoading?: boolean}[]>([
    { role: 'bot', content: 'Soy el asistente simulado. ¡Hazme una pregunta sobre las reglas o la disponibilidad del hotel que acabas de cargar!' }
  ]);

  const handleSendTestMessage = async () => {
    if (!testInput.trim()) return;
    
    const userMsg = { role: 'user', content: testInput };
    setTestMessages(prev => [...prev, userMsg]);
    setTestInput('');
    
    const tempBotMsg = { role: 'bot', content: 'Buscando en embeddings...', isLoading: true };
    setTestMessages(prev => [...prev, tempBotMsg]);

    try {
      // 1. Get query embedding from Voyage AI directly (Prototyping)
      const voyageRes = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_VOYAGE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ input: [userMsg.content], model: 'voyage-2' })
      });
      
      const voyageData = await voyageRes.json();
      if (!voyageRes.ok) throw new Error('Error con Voyage AI');
      
      const queryVector = voyageData.data[0].embedding;
      const vectorString = '[' + queryVector.join(',') + ']';

      // 2. Perform Cosine Similarity Search in Supabase using RPC
      const { data: closestContext, error } = await supabase
        .rpc('match_documents', {
          query_embedding: vectorString,
          match_threshold: 0.2,
          match_count: 1
        });

      if (error) throw error;

      if (!closestContext || closestContext.length === 0) {
        setTestMessages(prev => {
          const filtered = prev.filter(m => !m.isLoading);
          return [...filtered, { role: 'bot', content: 'No tengo información suficiente en mi base de conocimiento para responder a eso.' }];
        });
        return;
      }

      const context = closestContext[0].content;
      const confidence = Math.round(closestContext[0].similarity * 100);
      const botReply = `Recuperado de la Memoria (Certeza: ${confidence}%)\n\n${context}`;
      
      setTestMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading);
        return [...filtered, { role: 'bot', content: botReply }];
      });

    } catch (e) {
      setTestMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading);
        return [...filtered, { role: 'bot', content: 'Error conectando directo a Supabase/Voyage AI.' }];
      });
    }
  };

  const handleSaveKnowledge = async () => {
    if (!knowledgeText.trim()) return;
    setIsSaving(true);
    setSaveMessage('');
    try {
      // 1. Get query embedding from Voyage AI directly (Prototyping)
      const voyageRes = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_VOYAGE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ input: [knowledgeText], model: 'voyage-2' })
      });
      
      if (!voyageRes.ok) throw new Error('Error al conectar con VoyageAI');
      const voyageData = await voyageRes.json();
      const vector = voyageData.data[0].embedding;
      const vectorString = '[' + vector.join(',') + ']';

      // 2. Insert into Supabase knowledge RAG table directly
      const { error } = await supabase
        .from('knowledge_documents')
        .insert([
          { content: knowledgeText, embedding: vectorString }
        ]);

      if (error) throw error;
      
      setSaveMessage('¡Conocimiento vectorizado y guardado con éxito!');
      setKnowledgeText('');
    } catch (error) {
      console.error(error);
      setSaveMessage('Error: No se pudo conectar con Supabase o Voyage.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans overflow-hidden">
      
      {/* Sidebar - Navigation */}
      <div className="w-16 flex-shrink-0 bg-gradient-to-b from-indigo-700 to-purple-800 hidden md:flex flex-col items-center py-6 shadow-xl z-20">
        <div className="text-white bg-white/20 p-2 rounded-xl backdrop-blur-md mb-8 shadow-inner shadow-white/30">
          <Bot size={28} />
        </div>
        <div className="flex flex-col gap-6 flex-1 text-indigo-200">
          <button 
            onClick={() => setActiveView('chat')}
            className={`p-2 rounded-xl transition ${activeView === 'chat' ? 'text-white bg-white/20 shadow-inner' : 'hover:text-white hover:bg-white/10'}`}>
            <MessageSquare size={24} />
          </button>
          
          <button 
            onClick={() => setActiveView('knowledge')}
            className={`p-2 rounded-xl transition ${activeView === 'knowledge' ? 'text-white bg-white/20 shadow-inner' : 'hover:text-white hover:bg-white/10'}`}>
            <BookOpen size={24} />
          </button>

          <button className="p-2 hover:text-white hover:bg-white/10 rounded-xl transition"><User size={24} /></button>
          <button className="p-2 hover:text-white hover:bg-white/10 rounded-xl transition"><Bell size={24} /></button>
        </div>
        <button className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition"><Settings size={24} /></button>
      </div>

      {activeView === 'chat' ? (
        <>
          {/* Conversations List */}
          <div className="w-96 flex-shrink-0 flex flex-col bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 shadow-lg z-10">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">Mensajes</h2>
                <button className="md:hidden p-2"><Menu size={24} /></button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar chats..." 
                  className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-full py-2 pl-10 pr-4 focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all shadow-inner"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto w-full">
              {MOCK_CONVERSATIONS.map(conv => (
                <div 
                  key={conv.id} 
                  onClick={() => setActiveConv(conv)}
                  className={`p-4 border-b border-slate-50 dark:border-slate-800/50 cursor-pointer transition-all duration-300 relative group
                    ${activeConv.id === conv.id ? 'bg-indigo-50/60 dark:bg-indigo-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
                >
                  {activeConv.id === conv.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-r shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>}
                  
                  <div className="flex justify-between items-start mb-1 px-1">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-100 to-indigo-100 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold shadow-sm border border-white dark:border-slate-700">
                        {conv.name ? conv.name.charAt(0) : '#'}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{conv.name || conv.phone}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full 
                            ${conv.mode === 'AI_SUGGEST' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 
                              conv.mode === 'HUMAN' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 
                              'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-500'}`}>
                            {conv.mode}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-slate-400 font-medium">{conv.time}</span>
                      {conv.unread > 0 && (
                        <span className="mt-1 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full shadow-md shadow-pink-500/30">
                          {conv.unread}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 truncate pl-14">{conv.lastMessage}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col relative bg-[#f0f2f5] dark:bg-[#0b141a]">
            {/* Chat Header */}
            <div className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center px-6 shadow-sm z-10 w-full relative">
              <div className="flex items-center gap-4">
                <UserCircle2 size={36} className="text-slate-400" />
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    {activeConv.name || activeConv.phone}
                  </h2>
                  <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> En línea
                  </span>
                </div>
              </div>
              <button className="px-5 py-2.5 bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-700 dark:to-slate-600 text-white rounded-full text-sm font-semibold hover:shadow-lg transition-all flex items-center gap-2 transform hover:scale-105 active:scale-95">
                <User size={16} /> Tomar Chat Manual
              </button>
            </div>
            
            {/* Chat Background & Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 relative">
              <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.015] pointer-events-none bg-[url('https://wallpapers.com/images/hd/whatsapp-chat-background-pf4q86mbbm6t6nvo.jpg')] bg-repeat"></div>
              
              <div className="flex justify-center mb-6">
                <span className="text-xs bg-slate-200/60 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-medium px-4 py-1.5 rounded-full shadow-sm">
                  Hoy
                </span>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl rounded-tl-sm w-fit max-w-[75%] shadow hover:shadow-md transition-shadow relative group">
                <p className="text-slate-800 dark:text-slate-200 leading-snug">{activeConv.lastMessage}</p>
                <div className="flex justify-end items-center gap-1 mt-1 text-[10px] text-slate-400">
                  {activeConv.time}
                </div>
              </div>
                 
              {activeConv.status === 'Atendida' && (
                <div className="flex justify-end">
                  <div className="bg-gradient-to-br from-indigo-100 to-blue-50 dark:from-indigo-900/60 dark:to-slate-800 p-3.5 rounded-2xl rounded-tr-sm w-fit max-w-[75%] shadow-md border border-indigo-50/50 dark:border-indigo-800/30">
                    <p className="text-slate-800 dark:text-slate-200 leading-snug">Gracias por la información</p>
                    <div className="flex justify-end items-center gap-1 mt-1 text-[10px] text-indigo-400">
                      {activeConv.time} <CheckCheck size={14} className="text-blue-500" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* AI Suggestion Premium Panel (Glassmorphism) */}
            {activeConv.mode === 'AI_SUGGEST' && (
              <div className="px-6 py-4 absolute bottom-20 left-0 right-0 z-20">
                <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-indigo-100 dark:border-indigo-900/50 p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-1.5 rounded-lg">
                        <Sparkles size={16} className="text-white" />
                      </div>
                      <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-700 to-indigo-700 dark:from-purple-400 dark:to-indigo-400 text-sm">
                        Sugerencia IA generada
                      </span>
                    </div>
                    <div className="flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1 rounded-full text-xs font-bold border border-green-200 dark:border-green-800/50">
                      <Clock size={12} /> 95% Confianza
                    </div>
                  </div>
                  <textarea 
                    className="w-full p-4 border border-slate-200 dark:border-slate-700/50 rounded-2xl bg-slate-50/50 dark:bg-slate-950/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all resize-none shadow-inner text-sm leading-relaxed"
                    rows={2}
                    value={aiSuggestion}
                    onChange={(e) => setAiSuggestion(e.target.value)}
                  />
                  <div className="flex gap-3 mt-4">
                    <button className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold w-full shadow-lg shadow-indigo-500/30 transform hover:-translate-y-0.5 transition-all active:scale-95">
                      <Send size={18} /> Enviar Sugerencia
                    </button>
                    <button className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl font-semibold w-1/3 transition-all active:scale-95 border border-slate-200 dark:border-slate-700">
                      Descartar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Manual Reply Input Space */}
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-3 shadow-ambient relative z-30">
              <button className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors">
                <Sparkles size={22} className="text-purple-500" />
              </button>
              <input 
                type="text" 
                placeholder="Escribe un mensaje al cliente..." 
                className="flex-1 px-5 py-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium" 
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <button className="px-5 p-3 relative group w-14 rounded-2xl flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 transform transition-all active:scale-95">
                <Send size={20} className="ml-1 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </>
      ) : (
        /* KNOWLEDGE BASE VIEW */
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 flex flex-col p-8 md:p-12 relative w-full items-center">
          
          <div className="w-full max-w-4xl">
            <div className="mb-10 text-center">
              <div className="inline-flex items-center justify-center p-4 bg-gradient-to-tr from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-3xl mb-4 shadow-sm border border-indigo-200 dark:border-indigo-800/50">
                <Database size={40} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 tracking-tight">
                Alimentar Conocimiento IA
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mt-4 text-lg mx-auto">
                Introduce información sobre tu hotel y la guardaremos optimizada como Embeddings y RAG utilizando <span className="font-bold text-indigo-500">Voyage AI</span>.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all">
              <div className="p-8">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 ml-1 uppercase tracking-wider">
                  Fragmento de Conocimiento
                </label>
                <textarea 
                  className="w-full h-56 p-5 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 dark:focus:ring-indigo-500/20 dark:focus:border-indigo-500 transition-all resize-none shadow-inner text-slate-700 dark:text-slate-300 placeholder:text-slate-400"
                  placeholder="Ej: El horario de check-in es a las 14:00 y el late check-out a las 18:00 hrs cuesta 20 USD adicionales. La piscina techada abre al público a las 9 am."
                  value={knowledgeText}
                  onChange={(e) => setKnowledgeText(e.target.value)}
                />

                <div className="flex gap-4 mt-8 flex-col sm:flex-row">
                  <button 
                    onClick={handleSaveKnowledge}
                    disabled={isSaving}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-[0_8px_20px_rgba(99,102,241,0.3)] transform hover:-translate-y-1 active:scale-95 transition-all disabled:opacity-50 disabled:transform-none">
                    <Database size={22} /> {isSaving ? 'Guardando...' : 'Generar conocimiento y guardar'}
                  </button>
                  <button 
                    onClick={() => setIsTestModalOpen(true)}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-md border border-slate-200 dark:border-slate-700 transform hover:-translate-y-1 active:scale-95 transition-all">
                    <MessageCircle size={22} /> Probar Bot (Testing RAG)
                  </button>
                </div>
                {saveMessage && (
                  <p className={`mt-4 text-center font-semibold text-sm ${saveMessage.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
                    {saveMessage}
                  </p>
                )}
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 p-4 text-center">
                <span className="text-xs text-slate-500 flex items-center justify-center gap-1.5 font-medium">
                  <Sparkles size={14} className="text-indigo-400" /> Powered by Voyage AI & Supabase pgvector
                </span>
              </div>
            </div>
          </div>
          
          {/* Test Bot Modal Overlay */}
          {isTestModalOpen && (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
              <div 
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                onClick={() => setIsTestModalOpen(false)}
              ></div>
              <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-[600px] animate-in fade-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 flex justify-between items-center text-white">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                      <Bot size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg leading-tight">Bot Tester</h3>
                      <p className="text-indigo-100 text-xs">Simulador RAG Voyage AI</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsTestModalOpen(false)}
                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                {/* Modal Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/50">
                  {testMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] p-3 rounded-2xl ${
                        msg.role === 'user' 
                          ? 'bg-indigo-600 text-white rounded-tr-sm shadow-md' 
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-tl-sm shadow-sm'
                      }`}>
                        {msg.isLoading ? (
                           <div className="flex items-center gap-2">
                             <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                             <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-100"></div>
                             <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-200"></div>
                           </div>
                        ) : (
                          <p className="text-sm break-words whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Modal Input */}
                <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                  <input
                    type="text"
                    placeholder="Haz una pregunta al bot..."
                    className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-950 rounded-xl outline-none text-sm transition-all text-slate-700 dark:text-slate-200"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendTestMessage()}
                  />
                  <button 
                    onClick={handleSendTestMessage}
                    className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-colors"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}
          
        </div>
      )}
    </div>
  );
}
