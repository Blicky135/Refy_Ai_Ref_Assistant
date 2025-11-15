
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useTimer } from './hooks/useTimer';
import { askAIReferee } from './services/geminiService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DEFAULT_SETTINGS, RULES_CONTENT } from './constants';
import { MatchData, Tab, Team, EventType, EventLog, MatchStatus, Settings, Rule } from './types';
import { Icon } from './components/Icon';
import { Modal } from './components/Modal';
import { Accordion } from './components/Accordion';

const initialMatchData: MatchData = {
  status: 'pre-match',
  kickoffTeam: null,
  currentHalf: 1,
  score: { home: 0, away: 0 },
  cards: { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } },
  eventLog: [],
};

const formatTime = (timeInSeconds: number) => {
    const totalSeconds = Math.round(timeInSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const formatMinute = (timeInSeconds: number) => {
  const totalSeconds = Math.round(timeInSeconds || 0);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}'`;
};

// Normalize AI responses for cleaner display:
// - Remove lines like "Ask AI Assistant" or "Ask REFY"
// - Remove checkbox markers
// - Convert unordered list markers (*, -, +) into a numbered list
// - Collapse multiple blank lines
const normalizeAIResponse = (text: string) => {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;

  for (let raw of lines) {
    const line = raw.replace(/\s+$/g, '');
    const trimmed = line.trim();
    
    // Preserve blank lines for paragraph breaks
    if (!trimmed) {
      out.push('');
      inList = false;
      continue;
    }

    // drop UI headings that sometimes appear in the response
    if (/^ask\s+(ai assistant|refy)\b/i.test(trimmed)) continue;

    // remove checkbox markers like "- [x]" or "* [ ]"
    let cleaned = line.replace(/\[\s*[xX ]?\s*\]\s*/g, '');

    // Detect list items and convert to markdown format
    const markerMatch = cleaned.match(/^\s*(?:[•*+\-]|\d+[\.\)])\s+(.*)$/);
    if (markerMatch) {
      // It's a list item: convert to markdown bullet with leading blank line if starting a list
      if (!inList) {
        out.push('');
        inList = true;
      }
      cleaned = '- ' + markerMatch[1].trim();
    } else {
      // Not a list item: regular paragraph
      if (inList) {
        out.push('');
        inList = false;
      }
      cleaned = cleaned.trimStart();
    }

    out.push(cleaned);
  }

  // collapse multiple consecutive blank lines into a single blank line
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

// Custom markdown renderers for better list spacing and formatting
const markdownComponents = {
  ul: ({ children }: any) => (
    <ul className="list-disc list-inside space-y-2 my-2 ml-2">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal list-inside space-y-2 my-2 ml-2">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="ml-2">{children}</li>
  ),
  p: ({ children }: any) => (
    <p className="my-3 leading-relaxed">{children}</p>
  ),
};

const App: React.FC = () => {
  const [matchData, setMatchData] = useLocalStorage<MatchData>('currentMatch', initialMatchData);
  const [matchHistory, setMatchHistory] = useLocalStorage<MatchData[]>('matchHistory', []);
  const [settings, setSettings] = useLocalStorage<Settings>('appSettings', DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<Tab>('game');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isExtraTimeModalOpen, setIsExtraTimeModalOpen] = useState(false);
  const [extraTimeInput, setExtraTimeInput] = useState({ minutes: '', seconds: '' });
  const [cardModalInfo, setCardModalInfo] = useState<{ team: Team; card: 'yellow' | 'red' } | null>(null);
  const [stoppageTimeAdded, setStoppageTimeAdded] = useState(0);

  const timer = useTimer(settings.halfDuration);
  // Keep document root class in sync with selected theme so CSS variables apply
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);
  const prevTimeRef = useRef(timer.time);

  const addEvent = useCallback((type: EventType, gameTimeInSeconds: number, team?: Team, details?: string) => {
    setMatchData(prev => ({
      ...prev,
      eventLog: [...prev.eventLog, { id: Date.now().toString(), gameTimeInSeconds, type, team, details }],
    }));
  }, [setMatchData]);

  const calculateCurrentGameTime = useCallback(() => {
    const baseTime = (matchData.currentHalf - 1) * settings.halfDuration;
    if (matchData.status === 'extra-time' && stoppageTimeAdded > 0) {
        const elapsedStoppage = stoppageTimeAdded - Math.max(0, timer.time);
        return baseTime + settings.halfDuration + elapsedStoppage;
    } else {
        const elapsedTimeInHalf = settings.halfDuration - timer.time;
        return baseTime + elapsedTimeInHalf;
    }
  }, [matchData.currentHalf, matchData.status, settings.halfDuration, timer.time, stoppageTimeAdded]);

  const endCurrentHalf = useCallback(() => {
    if (matchData.status === 'half-time' || matchData.status === 'full-time') return;

    timer.pause();
    addEvent(EventType.HALF_END, calculateCurrentGameTime(), undefined, `End of Half ${matchData.currentHalf}`);
    
    const nextStatus = matchData.currentHalf >= 2 ? 'full-time' : 'half-time';
    setMatchData(prev => ({ ...prev, status: nextStatus }));
  }, [addEvent, calculateCurrentGameTime, matchData.currentHalf, matchData.status, setMatchData, timer]);


  // Effect to handle timer reaching zero
  useEffect(() => {
    const timerJustEnded = prevTimeRef.current > 0 && timer.time <= 0;
    if (timerJustEnded) {
        if (settings.vibration && navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 200]);
        }
    
        if (matchData.status === 'extra-time') {
            endCurrentHalf();
        } else {
            setIsExtraTimeModalOpen(true);
        }
    }
    prevTimeRef.current = timer.time;
  }, [timer.time, matchData.status, settings.vibration, endCurrentHalf]);

  useEffect(() => {
    timer.reset(settings.halfDuration);
  }, [settings.halfDuration, timer.reset]);

  const startNewGame = useCallback(() => {
    if (matchData.status !== 'pre-match') {
      const finishedMatch = { ...matchData, finalScore: matchData.score, date: Date.now() };
      setMatchHistory(prev => [finishedMatch, ...prev]);
    }
    setMatchData(initialMatchData);
    timer.reset(settings.halfDuration);
    setStoppageTimeAdded(0);
    setActiveTab('game');
  }, [matchData, setMatchHistory, setMatchData, timer, settings.halfDuration]);

  const handleKickoffSelect = (team: Team) => {
    setMatchData(prev => ({
      ...prev,
      kickoffTeam: team,
      status: 'in-progress'
    }));
    addEvent(EventType.KICKOFF, 0, team, `${team.charAt(0).toUpperCase() + team.slice(1)} has kickoff`);
  };

  const handlePlay = useCallback(() => {
    const isHalfAlreadyStarted = matchData.eventLog.some(
      (e) => e.type === EventType.HALF_START && e.details?.includes(`Half ${matchData.currentHalf}`)
    );

    if (!isHalfAlreadyStarted) {
      const eventTime = (matchData.currentHalf - 1) * settings.halfDuration;
      addEvent(EventType.HALF_START, eventTime, undefined, `Half ${matchData.currentHalf} Started`);
    }
    timer.start();
  }, [matchData.eventLog, matchData.currentHalf, addEvent, timer, settings.halfDuration]);
  
  const handleStartNextHalf = () => {
    const nextHalf = matchData.currentHalf + 1;
    setMatchData(prev => ({...prev, status: 'in-progress', currentHalf: nextHalf}));
    setStoppageTimeAdded(0);
    timer.reset(settings.halfDuration);
  };

  const handleScore = (team: Team) => {
    setMatchData(prev => ({
      ...prev,
      score: { ...prev.score, [team]: prev.score[team] + 1 },
    }));
    addEvent(EventType.GOAL, calculateCurrentGameTime(), team);
  };
  
  const handleRemoveGoal = (team: Team) => {
    setMatchData(prev => ({
      ...prev,
      score: { ...prev.score, [team]: Math.max(0, prev.score[team] - 1) },
    }));
    addEvent(EventType.GOAL_REMOVED, calculateCurrentGameTime(), team);
  };
  
  const handleCardSubmit = (team: Team, card: 'yellow' | 'red', playerInfo: { name: string; number: string }) => {
    setMatchData(prev => ({
      ...prev,
      cards: { ...prev.cards, [team]: { ...prev.cards[team], [card]: prev.cards[team][card] + 1 } },
    }));
    const details = `Player: ${playerInfo.name || 'N/A'}, Number: ${playerInfo.number || 'N/A'}`;
    addEvent(card === 'yellow' ? EventType.YELLOW_CARD : EventType.RED_CARD, calculateCurrentGameTime(), team, details);
    setCardModalInfo(null);
  };

  const handleAddExtraTime = () => {
    const mins = parseInt(extraTimeInput.minutes) || 0;
    const secs = parseInt(extraTimeInput.seconds) || 0;
    const totalSeconds = (mins * 60) + secs;
    if (totalSeconds > 0) {
      timer.addTime(totalSeconds);
      setStoppageTimeAdded(prev => prev + totalSeconds);
      const eventTime = matchData.currentHalf * settings.halfDuration;
      addEvent(EventType.EXTRA_TIME, eventTime, undefined, `${mins}m ${secs}s added`);
      setMatchData(prev => ({...prev, status: 'extra-time'}));
    }
    setIsExtraTimeModalOpen(false);
    setExtraTimeInput({ minutes: '', seconds: '' });
  };
  
  const handleDeclineExtraTime = () => {
    setIsExtraTimeModalOpen(false);
    endCurrentHalf();
  };
  
  return (
    <div className="h-screen w-screen flex justify-center items-center font-sans" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="relative w-[95%] max-w-sm h-[95vh] max-h-[800px] flex flex-col shadow-2xl rounded-3xl overflow-hidden" style={{ backgroundColor: 'var(--panel-bg)', color: 'var(--text-color)' }}>
        
        {/* Top Section with Images and Buttons */}
        <div className="w-full flex justify-between items-center p-2" style={{ backgroundColor: 'var(--panel-bg)' }}>
          {/* Settings Button - Top Left */}
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-gray-600 hover:text-gray-900"><Icon name="settings" /></button>
          
          {/* Centered Team Images */}
          <div className="flex items-center gap-1">
            <img src="/first trans.png" alt="Team 1" className="h-14 object-contain" />
            <img src="/second trans.png" alt="Team 2" className="h-14 object-contain" />
          </div>
          
          {/* History Button - Top Right */}
          <button onClick={() => setIsHistoryOpen(true)} className="p-2 text-gray-600 hover:text-gray-900"><Icon name="history" /></button>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 pb-28" style={{ backgroundColor: 'var(--content-bg)' }}>
          {activeTab === 'game' && <GameTab matchData={matchData} timer={timer} onScore={handleScore} onRemoveGoal={handleRemoveGoal} onCard={(team, card) => setCardModalInfo({team, card})} onPlay={handlePlay} onFinishHalf={endCurrentHalf} onStartNextHalf={handleStartNextHalf} onSelectKickoff={handleKickoffSelect} onGoToCoinFlip={() => setActiveTab('coin-flip')} />}
          {activeTab === 'report' && <ReportTab matchData={matchData} />}
          {activeTab === 'coin-flip' && <CoinFlipTab />}
          {activeTab === 'rules' && <RulesTab />}
        </main>

        {/* Bottom Navigation */}
        <nav className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center space-x-1 rounded-full shadow-2xl px-3 py-2 z-30" style={{ backgroundColor: 'var(--nav-bg)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <NavButton iconName="play" label="Game" isActive={activeTab === 'game'} onClick={() => setActiveTab('game')} />
          <NavButton iconName="book" label="Report" isActive={activeTab === 'report'} onClick={() => setActiveTab('report')} />
          <NavButton iconName="coin" label="Coin Flip" isActive={activeTab === 'coin-flip'} onClick={() => setActiveTab('coin-flip')} />
          <NavButton iconName="book" label="Rules" isActive={activeTab === 'rules'} onClick={() => setActiveTab('rules')} />
        </nav>

        {/* Modals */}
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
          settings={settings} 
          setSettings={setSettings} 
          onStartNewGame={() => { startNewGame(); setIsSettingsOpen(false); }} 
          onClearHistory={() => setMatchHistory([])}
        />
        <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} history={matchHistory} />
        <Modal isOpen={isExtraTimeModalOpen} onClose={() => setIsExtraTimeModalOpen(false)} title="Add Extra Time?">
            <div className="space-y-4">
                <div className="flex items-center space-x-2">
                    <input type="number" placeholder="Mins" value={extraTimeInput.minutes} onChange={(e) => setExtraTimeInput(p => ({...p, minutes: e.target.value}))} className="w-full p-2 border rounded-md text-center" />
                    <span className="font-bold text-lg">:</span>
                    <input type="number" placeholder="Secs" value={extraTimeInput.seconds} onChange={(e) => setExtraTimeInput(p => ({...p, seconds: e.target.value}))} className="w-full p-2 border rounded-md text-center" />
                </div>
                <button onClick={handleAddExtraTime} className="w-full bg-yellow-400 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-yellow-500 transition">Add Time</button>
                <button onClick={handleDeclineExtraTime} className="w-full bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300 transition">No</button>
            </div>
        </Modal>
        {cardModalInfo && (
            <CardInputModal 
                isOpen={!!cardModalInfo}
                onClose={() => setCardModalInfo(null)}
                onSubmit={(playerInfo) => handleCardSubmit(cardModalInfo.team, cardModalInfo.card, playerInfo)}
                team={cardModalInfo.team}
                card={cardModalInfo.card}
            />
        )}

      </div>
    </div>
  );
};

// --- Sub-components for better organization ---

const KickoffScreen: React.FC<{ onSelectKickoff: (team: Team) => void; onGoToCoinFlip: () => void; }> = ({ onSelectKickoff, onGoToCoinFlip }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <div className="w-full max-w-sm space-y-6">
            <h2 className="text-xl font-semibold text-gray-700">Which team has kickoff?</h2>
            <div className="space-y-3">
                <button onClick={() => onSelectKickoff('home')} className="w-full bg-blue-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-600 transition">Home Has Kickoff</button>
                <button onClick={() => onSelectKickoff('away')} className="w-full bg-red-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-600 transition">Away Has Kickoff</button>
                <button onClick={onGoToCoinFlip} className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition">Go to Coin Flip</button>
            </div>
            <p className="text-sm text-gray-500">Choose the team with kickoff to start the match.</p>
        </div>
    </div>
  );
};

const GameTab: React.FC<{ 
    matchData: MatchData, 
    timer: any, 
    onScore: (t: Team) => void, 
    onRemoveGoal: (t: Team) => void,
    onCard: (t: Team, c: 'yellow'|'red') => void, 
    onPlay: ()=>void, 
    onFinishHalf: ()=>void,
    onStartNextHalf: ()=>void,
    onSelectKickoff: (t: Team) => void,
    onGoToCoinFlip: () => void,
}> = (props) => {
  const { matchData, timer, onScore, onRemoveGoal, onCard, onPlay, onFinishHalf, onStartNextHalf, onSelectKickoff, onGoToCoinFlip } = props;

  if (matchData.status === 'pre-match') {
    return <KickoffScreen onSelectKickoff={onSelectKickoff} onGoToCoinFlip={onGoToCoinFlip} />;
  }
  
  const canPlay = matchData.status === 'in-progress' || matchData.status === 'extra-time';
  const canFinishHalf = matchData.status === 'in-progress' || matchData.status === 'extra-time';
  
  return (
    <div className="space-y-4">
      {/* Timer Card */}
      <div className="bg-white p-4 rounded-lg shadow text-center">
        <p className="text-sm text-gray-500">Half {matchData.currentHalf}</p>
        <p className="text-5xl sm:text-6xl font-mono font-bold text-gray-800 my-2">{timer.formattedTime}</p>
        <div className="flex justify-center items-center space-x-4">
          {timer.isActive ? (
             <button onClick={timer.pause} className="p-3 bg-yellow-400 text-gray-800 rounded-full hover:bg-yellow-500 transition timer-btn" aria-label="Pause"><span className="text-sm font-semibold">Pause</span></button>
          ) : (
            <button onClick={onPlay} disabled={!canPlay} className="p-3 bg-yellow-400 text-gray-800 rounded-full hover:bg-yellow-500 transition disabled:bg-gray-300 timer-btn" aria-label="Start"><span className="text-sm font-semibold">Start</span></button>
          )}
          <button onClick={() => timer.reset(DEFAULT_SETTINGS.halfDuration)} className="p-3 bg-yellow-400 text-gray-800 rounded-full hover:bg-yellow-500 transition reset-btn timer-btn" aria-label="Reset"><span className="text-sm font-semibold">Reset</span></button>
        </div>
        <div className="mt-4">
            {canFinishHalf && (
                <button onClick={onFinishHalf} className="w-full bg-red-500 text-white font-bold py-2 rounded-lg">Finish Half</button>
            )}
            {matchData.status === 'half-time' && (
                <button onClick={onStartNextHalf} className="w-full bg-green-500 text-white font-bold py-2 rounded-lg">Start Next Half</button>
            )}
        </div>
        <p className="text-xs text-gray-400 mt-2">Kickoff: {matchData.kickoffTeam?.toUpperCase()}</p>
      </div>
      {/* Score Card */}
      <div className="bg-white p-4 rounded-lg shadow">
         <h3 className="font-bold text-lg mb-2 text-center text-gray-700">Score</h3>
         <div className="grid grid-cols-2 gap-4 text-center">
           <div>
             <p className="text-gray-500">Home Team</p>
             <p className="text-4xl sm:text-5xl font-bold text-blue-600">{matchData.score.home}</p>
               <div className="flex justify-center space-x-2 mt-2">
               <button onClick={() => onRemoveGoal('home')} className="p-3 bg-gray-200 text-gray-800 rounded-full hover:bg-gray-300 transition remove-goal-btn"><Icon name="minus" className="w-5 h-5"/></button>
               <button onClick={() => onScore('home')} className="p-3 bg-yellow-400 text-gray-800 rounded-full hover:bg-yellow-500 transition"><Icon name="plus" className="w-5 h-5"/></button>
             </div>
           </div>
           <div>
             <p className="text-gray-500">Away Team</p>
             <p className="text-4xl sm:text-5xl font-bold text-red-600">{matchData.score.away}</p>
             <div className="flex justify-center space-x-2 mt-2">
               <button onClick={() => onRemoveGoal('away')} className="p-3 bg-gray-200 text-gray-800 rounded-full hover:bg-gray-300 transition remove-goal-btn"><Icon name="minus" className="w-5 h-5"/></button>
               <button onClick={() => onScore('away')} className="p-3 bg-yellow-400 text-gray-800 rounded-full hover:bg-yellow-500 transition"><Icon name="plus" className="w-5 h-5"/></button>
             </div>
           </div>
         </div>
      </div>
      {/* Cards */}
      <div className="bg-white p-4 rounded-lg shadow">
         <h3 className="font-bold text-lg mb-3 text-center text-gray-700">Cards</h3>
         <div className="grid grid-cols-2 gap-4">
           {/* Home Team Actions */}
           <div className="space-y-2">
             <p className="font-semibold text-center text-blue-600">Home</p>
             <div className="flex justify-center space-x-2">
               <button onClick={() => onCard('home', 'yellow')} className="w-12 h-12 bg-yellow-400 rounded-md flex items-center justify-center text-lg font-bold text-gray-800">Y</button>
               <button onClick={() => onCard('home', 'red')} className="w-12 h-12 bg-red-500 rounded-md flex items-center justify-center text-lg font-bold text-white">R</button>
             </div>
           </div>
           {/* Away Team Actions */}
           <div className="space-y-2">
             <p className="font-semibold text-center text-red-600">Away</p>
             <div className="flex justify-center space-x-2">
               <button onClick={() => onCard('away', 'yellow')} className="w-12 h-12 bg-yellow-400 rounded-md flex items-center justify-center text-lg font-bold text-gray-800">Y</button>
               <button onClick={() => onCard('away', 'red')} className="w-12 h-12 bg-red-500 rounded-md flex items-center justify-center text-lg font-bold text-white">R</button>
             </div>
           </div>
         </div>
      </div>
    </div>
  );
}

const ReportTab: React.FC<{ matchData: MatchData }> = ({ matchData }) => {
    const sortedLog = useMemo(() => [...matchData.eventLog].reverse(), [matchData.eventLog]);

    const cardEvents = useMemo(() => {
        const events: {
            home: { yellow: EventLog[], red: EventLog[] },
            away: { yellow: EventLog[], red: EventLog[] },
        } = {
            home: { yellow: [], red: [] },
            away: { yellow: [], red: [] },
        };
        for (const event of matchData.eventLog) {
            if (event.type === EventType.YELLOW_CARD && event.team) {
                events[event.team].yellow.push(event);
            } else if (event.type === EventType.RED_CARD && event.team) {
                events[event.team].red.push(event);
            }
        }
        return events;
    }, [matchData.eventLog]);

    const CardList: React.FC<{ events: EventLog[] }> = ({ events }) => (
        <ul className="pl-5 mt-1 space-y-1 text-sm list-disc text-gray-700">
            {events.map(event => (
              <li key={event.id}>
                <span className="font-semibold">{formatMinute(event.gameTimeInSeconds ?? 0)}</span>
                {event.details && `: ${event.details}`}
              </li>
            ))}
        </ul>
    );

    return (
        <div className="space-y-4">
            <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-bold text-lg mb-3 text-gray-800">Card Summary</h3>
                <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                    {/* Home Team Cards */}
                    <div>
                        <p className="font-bold text-blue-600">Home Team</p>
                        <div className="mt-2 text-gray-800">
                            <p className="font-semibold">Red Cards: {cardEvents.home.red.length}</p>
                            {cardEvents.home.red.length > 0 && <CardList events={cardEvents.home.red} />}
                        </div>
                        <div className="mt-3 text-gray-800">
                            <p className="font-semibold">Yellow Cards: {cardEvents.home.yellow.length}</p>
                            {cardEvents.home.yellow.length > 0 && <CardList events={cardEvents.home.yellow} />}
                        </div>
                    </div>
                    {/* Away Team Cards */}
                    <div>
                        <p className="font-bold text-red-600">Away Team</p>
                        <div className="mt-2 text-gray-800">
                            <p className="font-semibold">Red Cards: {cardEvents.away.red.length}</p>
                            {cardEvents.away.red.length > 0 && <CardList events={cardEvents.away.red} />}
                        </div>
                        <div className="mt-3 text-gray-800">
                           <p className="font-semibold">Yellow Cards: {cardEvents.away.yellow.length}</p>
                            {cardEvents.away.yellow.length > 0 && <CardList events={cardEvents.away.yellow} />}
                        </div>
                    </div>
                </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-bold text-lg mb-2 text-gray-800">Chronological Event Log</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {sortedLog.length > 0 ? sortedLog.map(event => (
                        <div key={event.id} className="text-sm p-2 bg-gray-50 rounded text-gray-900">
                                  <p><span className="font-semibold">{formatMinute(event.gameTimeInSeconds ?? 0)}</span>: {event.type} {event.team ? `(${event.team.toUpperCase()})` : ''}</p>
                           {event.details && <p className="text-xs text-gray-600 italic mt-1">{event.details}</p>}
                        </div>
                    )) : <p className="text-gray-500 text-sm">No events logged yet.</p>}
                </div>
            </div>
        </div>
    );
}


const CoinFlipTab: React.FC = () => {
    const [result, setResult] = useState<'Heads' | 'Tails' | null>(null);
    const [flipping, setFlipping] = useState(false);

    const flipCoin = () => {
        setFlipping(true);
        setResult(null);
        setTimeout(() => {
            setResult(Math.random() < 0.5 ? 'Heads' : 'Tails');
            setFlipping(false);
        }, 1000);
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow text-center">
            <h3 className="font-bold text-lg mb-4 text-gray-700">Coin Flip</h3>
            <div className="flex justify-center items-center h-40">
                {flipping && <div className="animate-spin rounded-full h-24 w-24 border-b-4 border-yellow-400"></div>}
                {result && <p className="text-4xl font-bold text-gray-800">{result}</p>}
                {!result && !flipping && <p className="text-gray-500">Press button to flip</p>}
            </div>
            <button onClick={flipCoin} disabled={flipping} className="w-full mt-4 bg-yellow-400 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-yellow-500 transition disabled:bg-gray-300">
                {flipping ? 'Flipping...' : 'Flip Coin'}
            </button>
        </div>
    );
};

const RulesTab: React.FC = () => {
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleAsk = async () => {
        if (!question.trim()) return;
        setIsLoading(true);
      setAnswer('');
      const response = await askAIReferee(question);
      setAnswer(normalizeAIResponse(response));
        setIsLoading(false);
    };

    return (
        <div className="space-y-4">
             <div className="bg-white p-4 rounded-lg shadow">
                <div className="flex items-center space-x-2 mb-2">
                    <Icon name="sparkle" className="w-6 h-6 text-yellow-500" />
                    <h3 className="font-bold text-lg text-gray-700">Ask AI Assistant</h3>
                </div>
                <div className="space-y-2">
                    <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g., Is this a yellow card offense..." className="w-full p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-yellow-100 text-black placeholder-gray-600" rows={3}></textarea>
                    <button onClick={handleAsk} disabled={isLoading} className="w-full bg-yellow-400 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-yellow-500 transition disabled:bg-gray-300">
                        {isLoading ? 'Thinking...' : 'Ask REFY'}
                    </button>
                    {answer && (
                      <div className="mt-2 p-3 bg-yellow-100 rounded-md text-sm text-black">
                        <div className="prose prose-sm dark:prose-invert">
                          <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                </div>
            </div>
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-4 flex items-center space-x-2">
                   <Icon name="book" className="w-6 h-6 text-gray-500" />
                   <h3 className="font-bold text-lg text-gray-700">Quick Rules Reference</h3>
                </div>
                {RULES_CONTENT.map(rule => <Accordion key={rule.title} title={rule.title}><p className="text-sm">{rule.content}</p></Accordion>)}
            </div>
        </div>
    );
};

const SettingsModal: React.FC<{
  isOpen: boolean,
  onClose: () => void,
  settings: Settings,
  setSettings: React.Dispatch<React.SetStateAction<Settings>>,
  onStartNewGame: () => void,
  onClearHistory: () => void
}> = ({ isOpen, onClose, settings, setSettings, onStartNewGame, onClearHistory }) => {
  const [showConfirm, setShowConfirm] = useState<'new' | 'history' | null>(null);
  const [showDurationPrompt, setShowDurationPrompt] = useState(false);

  const handleNewGameConfirm = () => {
      onStartNewGame();
      setShowConfirm(null);
  };
  
  const handleClearHistoryConfirm = () => {
      onClearHistory();
      setShowConfirm(null);
  };

  // --- Duration prompt component (local) ---
  const DurationPrompt: React.FC<{ initialSeconds: number; onCancel: () => void; onConfirm: (seconds: number) => void }> = ({ initialSeconds, onCancel, onConfirm }) => {
    const initialMins = Math.floor(initialSeconds / 60);
    const initialSecs = initialSeconds % 60;
    const [mins, setMins] = useState(String(initialMins));
    const [secs, setSecs] = useState(String(initialSecs));
    const [error, setError] = useState('');

    const handleConfirm = () => {
      const m = parseInt(mins) || 0;
      const s = parseInt(secs) || 0;
      const total = (m * 60) + s;
      const MAX_SECONDS = 100 * 60; // 100 minutes
      if (total <= 0) {
        setError('Invalid time entered');
        return;
      }
      if (total > MAX_SECONDS) {
        setError('Maximum halftime is 100 minutes');
        return;
      }
      onConfirm(total);
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <input type="number" min={0} max={100} value={mins} onChange={(e) => setMins(e.target.value)} className="w-1/2 p-2 border rounded-md" placeholder="Mins" />
          <input type="number" min={0} max={59} value={secs} onChange={(e) => setSecs(e.target.value)} className="w-1/2 p-2 border rounded-md" placeholder="Secs" />
        </div>
        {error && <p className="text-sm text-red-500 error-text">{error}</p>}
        <div className="flex justify-end space-x-2">
          <button onClick={onCancel} className="px-4 py-2 bg-gray-200 rounded-md">Cancel</button>
          <button onClick={handleConfirm} className="px-4 py-2 bg-yellow-400 text-gray-800 rounded-md">Confirm</button>
        </div>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Half Duration</label>
            <div className="mt-1 flex items-center" style={{ gap: '0.75rem' }}>
            <div className="text-lg font-semibold text-gray-700">{Math.floor(settings.halfDuration / 60)}m {settings.halfDuration % 60}s</div>
            <div style={{ marginLeft: 'auto' }}>
              <button
                type="button"
                onClick={() => setShowDurationPrompt(true)}
                className={`inline-flex items-center px-3 py-1.5 rounded-md border bg-yellow-400 hover:bg-yellow-500 transition ${settings.theme === 'dark' ? 'text-white border-yellow-500' : 'text-gray-900 border-yellow-600'}`}
                style={{ transform: 'translateX(6px)' }}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Vibration on Timer End</span>
          <button
            onClick={() => setSettings(s => ({...s, vibration: !s.vibration}))}
            className={`vibration-toggle relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${settings.vibration ? 'bg-yellow-400' : 'bg-gray-200'}`}
          >
            <span className={`vibration-toggle-thumb inline-block w-4 h-4 transform rounded-full transition-transform ${settings.vibration ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Dark Mode</span>
          <button
            onClick={() => setSettings(s => ({...s, theme: s.theme === 'dark' ? 'light' : 'dark'}))}
            className={`theme-toggle relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${settings.theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}
          >
            <span className={`theme-toggle-thumb inline-block w-4 h-4 transform rounded-full transition-transform ${settings.theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="border-t pt-4 space-y-2">
            <button onClick={() => setShowConfirm('new')} className="w-full text-left p-2 rounded hover:bg-gray-100 text-blue-600 font-semibold">Start New Game</button>
            <button onClick={() => setShowConfirm('history')} className="w-full text-left p-2 rounded hover:bg-gray-100 text-red-600 font-semibold">Clear Match History</button>
        </div>
      </div>
      {/* Duration Prompt Modal */}
      <Modal isOpen={showDurationPrompt} onClose={() => setShowDurationPrompt(false)} title="Set Half Duration">
          <DurationPrompt
            initialSeconds={settings.halfDuration}
            onCancel={() => setShowDurationPrompt(false)}
            onConfirm={(seconds) => { setSettings(s => ({...s, halfDuration: seconds})); setShowDurationPrompt(false); }}
          />
      </Modal>

      {/* Confirmation Modals */}
      <Modal isOpen={showConfirm === 'new'} onClose={() => setShowConfirm(null)} title="Confirm New Game">
          <p className="text-gray-600 mb-4">Start a new game? This will save the current match to history and reset all data.</p>
          <div className="flex justify-end space-x-2">
              <button onClick={() => setShowConfirm(null)} className="px-4 py-2 bg-gray-200 rounded-md">Cancel</button>
              <button onClick={handleNewGameConfirm} className="px-4 py-2 bg-blue-500 text-white rounded-md">Confirm</button>
          </div>
      </Modal>
      <Modal isOpen={showConfirm === 'history'} onClose={() => setShowConfirm(null)} title="Confirm Clear History">
          <p className="text-gray-600 mb-4">Are you sure you want to delete all saved match history? This action cannot be undone.</p>
          <div className="flex justify-end space-x-2">
              <button onClick={() => setShowConfirm(null)} className="px-4 py-2 bg-gray-200 rounded-md">Cancel</button>
              <button onClick={handleClearHistoryConfirm} className="px-4 py-2 bg-red-500 text-white rounded-md">Confirm</button>
          </div>
      </Modal>
    </Modal>
  );
};

const HistoryModal: React.FC<{ isOpen: boolean, onClose: () => void, history: MatchData[] }> = ({ isOpen, onClose, history }) => {
    const [selectedMatch, setSelectedMatch] = useState<MatchData | null>(null);
    return (
        <Modal isOpen={isOpen} onClose={() => { onClose(); setSelectedMatch(null); }} title="Match History">
            {selectedMatch ? (
                <div>
                    <button onClick={() => setSelectedMatch(null)} className="text-sm text-blue-500 mb-2">&larr; Back to list</button>
                    <h4 className="font-bold mb-2 text-gray-800">Match on {new Date(selectedMatch.date!).toLocaleDateString()}</h4>
                    <p className="font-semibold text-gray-800">Final Score: {selectedMatch.finalScore?.home} - {selectedMatch.finalScore?.away}</p>
                    <ReportTab matchData={selectedMatch} />
                </div>
            ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {history.length > 0 ? history.map(match => (
                        <button key={match.date} onClick={() => setSelectedMatch(match)} className="w-full text-left p-3 bg-gray-100 rounded-lg hover:bg-gray-200">
                            <p className="font-semibold text-gray-800">{new Date(match.date!).toLocaleString()}</p>
                            <p className="text-sm text-gray-700">Score: {match.finalScore?.home} - {match.finalScore?.away}</p>
                            <p className="text-sm text-gray-700">Cards: {match.cards.home.yellow + match.cards.away.yellow}Y / {match.cards.home.red + match.cards.away.red}R</p>
                        </button>
                    )) : <p className="text-gray-500">No match history found.</p>}
                </div>
            )}
        </Modal>
    );
};

const CardInputModal: React.FC<{ isOpen: boolean; onClose: () => void; onSubmit: (playerInfo: { name: string; number: string; }) => void; team: Team; card: 'yellow' | 'red'; }> = ({ isOpen, onClose, onSubmit, team, card }) => {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, number });
    setName('');
    setNumber('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Issue ${card.charAt(0).toUpperCase() + card.slice(1)} Card`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p>Team: <span className={`font-bold ${team === 'home' ? 'text-blue-600' : 'text-red-600'}`}>{team.toUpperCase()}</span></p>
        <div>
          <label className="block text-sm font-medium text-gray-700">Player Name (Optional)</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Player Number (Optional)</label>
          <input type="number" value={number} onChange={(e) => setNumber(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
        </div>
        <button type="submit" className="w-full bg-yellow-400 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-yellow-500 transition">Confirm Card</button>
      </form>
    </Modal>
  );
};

const NavButton: React.FC<{ iconName: string, label: string, isActive: boolean, onClick: () => void }> = ({ iconName, label, isActive, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center rounded-full transition-all duration-300 h-12 px-3 text-xs font-semibold whitespace-nowrap ${isActive ? 'bg-yellow-400 text-gray-900 shadow-lg scale-105' : 'text-gray-500 hover:text-gray-700'}`}>
    <Icon name={iconName} className="w-5 h-5" />
    <span className="mt-0.5">{label}</span>
  </button>
);


export default App;
