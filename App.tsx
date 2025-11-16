//hala habibi
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
    <ul className="list-disc space-y-2 my-2 pl-6">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal space-y-2 my-2 pl-6">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="ml-0">{children}</li>
  ),
  p: ({ children }: any) => (
    <p className="my-3 leading-relaxed">{children}</p>
  ),
};

const App: React.FC = () => {
    // State for Half 3/4 prompt
    const [isExtraHalfModalOpen, setIsExtraHalfModalOpen] = useState(false);
    const [extraHalfInput, setExtraHalfInput] = useState({ minutes: '', seconds: '' });
    const [extraHalfError, setExtraHalfError] = useState('');
    const [pendingHalf, setPendingHalf] = useState<number | null>(null); // 3 or 4
    const [customHalfDurations, setCustomHalfDurations] = useState<{ [key: number]: number }>({});
  // Initialize with merged defaults to handle old localStorage data missing new properties
  const initSettings = () => {
    const stored = JSON.parse(localStorage.getItem('appSettings') || 'null');
    return stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS;
  };
  
  const [matchData, setMatchData] = useLocalStorage<MatchData>('currentMatch', initialMatchData);
  const [matchHistory, setMatchHistory] = useLocalStorage<MatchData[]>('matchHistory', []);
  const [settings, setSettings] = useState<Settings>(initSettings());
  const [activeTab, setActiveTab] = useState<Tab>('game');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isExtraTimeModalOpen, setIsExtraTimeModalOpen] = useState(false);
  const [extraTimeInput, setExtraTimeInput] = useState({ minutes: '', seconds: '' });
  const [extraTimeError, setExtraTimeError] = useState('');
  const [cardModalInfo, setCardModalInfo] = useState<{ team: Team; card: 'yellow' | 'red' } | null>(null);
  const [stoppageTimeAdded, setStoppageTimeAdded] = useState(0);

  const timer = useTimer(settings.halfDuration);
  // Ref to indicate we are currently in stoppage/extra-time so calculations
  // can be correct synchronously (avoids setState race conditions)
  const inExtraTimeRef = useRef(false);
  // Total elapsed play time in seconds (only increases when time actually passes)
  const matchElapsedRef = useRef<number>(0);
  // Match elapsed at the moment the current half started
  const currentHalfStartMatchElapsedRef = useRef<number>(0);
  // Match elapsed at the moment extra time started
  const extraTimeStartMatchElapsedRef = useRef<number>(0);
  // Keep document root class in sync with selected theme so CSS variables apply
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);
  const prevTimeRef = useRef(timer.time);
  const prevIsActiveRef = useRef(timer.isActive);

  const addEvent = useCallback((type: EventType, gameTimeInSeconds: number, team?: Team, details?: string) => {
    setMatchData(prev => ({
      ...prev,
      eventLog: [...prev.eventLog, { id: Date.now().toString(), gameTimeInSeconds, type, team, details }],
    }));
  }, [setMatchData]);

  // Return the total actual elapsed game time in seconds.
  const calculateCurrentGameTime = useCallback(() => {
    return Math.max(0, Math.round(matchElapsedRef.current));
  }, []);

  const endCurrentHalf = useCallback(() => {
    if (matchData.status === 'half-time' || matchData.status === 'full-time') return;

    timer.pause();
    // Do NOT log HALF_END here — only log when user explicitly declines extra time.
    // For timer-based end, ask for extra time (before proceeding to next half)
    setIsExtraTimeModalOpen(true);
  }, [addEvent, calculateCurrentGameTime, matchData.status, setMatchData, timer]);

  // Handle what happens after extra time is declined (move to next half or end game)
  const proceedToNextPhase = useCallback(() => {
    // extra-time has ended (we are moving on)
    inExtraTimeRef.current = false;
    // clear stoppage time when moving to next phase
    setStoppageTimeAdded(0);
    // After Half 2, ask about Half 3
    if (matchData.currentHalf === 2) {
      const nextHalf = 3;
      setPendingHalf(nextHalf);
      setExtraHalfInput({
        minutes: String(Math.floor(settings.extraHalfDuration / 60)),
        seconds: String(settings.extraHalfDuration % 60)
      });
      setExtraHalfError('');
      setIsExtraHalfModalOpen(true);
    } else if (matchData.currentHalf === 3) {
      // After Half 3, automatically go to Half 4 with the same duration (no prompt)
      const half3Duration = customHalfDurations[3] || settings.extraHalfDuration;
      setCustomHalfDurations(prev => ({ ...prev, 4: half3Duration }));
      const nextStatus = 'in-progress';
      setMatchData(prev => ({ ...prev, status: nextStatus, currentHalf: 4 }));
      timer.reset(half3Duration);
      // mark start of Half 4 in elapsed timeline
      currentHalfStartMatchElapsedRef.current = Math.round(matchElapsedRef.current);
    } else if (matchData.currentHalf === 1) {
      // After Half 1, go straight to Half 2 (no prompt)
      const nextStatus = 'half-time';
      setMatchData(prev => ({ ...prev, status: nextStatus }));
    } else {
      // After Half 4, game is over
      const nextStatus = 'full-time';
      setMatchData(prev => ({ ...prev, status: nextStatus }));
    }
  }, [matchData.currentHalf, matchData.status, setMatchData, settings.extraHalfDuration, customHalfDurations, timer]);

    const handleManualFinishHalf = useCallback(() => {
      if (matchData.status === 'half-time' || matchData.status === 'full-time') return;
      timer.pause();
      // Log HALF_END when user manually finishes the half
      addEvent(EventType.HALF_END, calculateCurrentGameTime(), undefined, `End of Half ${matchData.currentHalf}`);
      proceedToNextPhase();
    }, [addEvent, calculateCurrentGameTime, matchData.status, matchData.currentHalf, timer, proceedToNextPhase]);


  // Effect to handle timer reaching zero
  useEffect(() => {
    // accumulate only actual time that passed (timer decreases). Don't count time added.
    const delta = prevTimeRef.current - timer.time;
    // accumulate only when the timer was active (real time passed)
    if (delta > 0 && prevIsActiveRef.current) {
      matchElapsedRef.current += delta;
    }

    const timerJustEnded = prevTimeRef.current > 0 && timer.time <= 0;
    if (timerJustEnded) {
      if (settings.vibration && navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
      // Timer naturally ended — ask about extra time first
      endCurrentHalf();
    }
    prevTimeRef.current = timer.time;
    prevIsActiveRef.current = timer.isActive;
  }, [timer.time, matchData.status, matchData.currentHalf, settings.vibration, endCurrentHalf]);

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
    inExtraTimeRef.current = false;
    matchElapsedRef.current = 0;
    currentHalfStartMatchElapsedRef.current = 0;
    extraTimeStartMatchElapsedRef.current = 0;
    setActiveTab('game');
  }, [matchData, setMatchHistory, setMatchData, timer, settings.halfDuration]);

  const handleKickoffSelect = (team: Team) => {
    setMatchData(prev => ({
      ...prev,
      kickoffTeam: team,
      status: 'in-progress'
    }));
    // mark the start of this half in the elapsed timeline
    currentHalfStartMatchElapsedRef.current = Math.round(matchElapsedRef.current);
    addEvent(EventType.KICKOFF, 0, team, `${team.charAt(0).toUpperCase() + team.slice(1)} has kickoff`);
  };

  const handlePlay = useCallback(() => {
    const isHalfAlreadyStarted = matchData.eventLog.some(
      (e) => e.type === EventType.HALF_START && e.details?.includes(`Half ${matchData.currentHalf}`)
    );

    if (!isHalfAlreadyStarted) {
      const eventTime = calculateCurrentGameTime();
      addEvent(EventType.HALF_START, eventTime, undefined, `Half ${matchData.currentHalf} Started`);
      currentHalfStartMatchElapsedRef.current = Math.round(matchElapsedRef.current);
    }
    timer.start();
  }, [matchData.eventLog, matchData.currentHalf, addEvent, timer, settings.halfDuration]);
  
  const handleStartNextHalf = () => {
    const nextHalf = matchData.currentHalf + 1;
    setMatchData(prev => ({...prev, status: 'in-progress', currentHalf: nextHalf}));
    setStoppageTimeAdded(0);
    timer.reset(settings.halfDuration);
    currentHalfStartMatchElapsedRef.current = Math.round(matchElapsedRef.current);
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
    // Check if inputs are blank
    if (extraTimeInput.minutes === '' || extraTimeInput.seconds === '') {
      setExtraTimeError('Please enter both minutes and seconds.');
      return;
    }
    // Check if inputs are valid integers
    if (!Number.isInteger(Number(extraTimeInput.minutes))) {
      setExtraTimeError('Invalid input. Minutes must be a whole number.');
      return;
    }
    if (!Number.isInteger(Number(extraTimeInput.seconds))) {
      setExtraTimeError('Invalid input. Seconds must be a whole number.');
      return;
    }

    const mins = parseInt(extraTimeInput.minutes);
    const secs = parseInt(extraTimeInput.seconds);
    const totalSeconds = (mins * 60) + secs;
    const MAX_SECONDS = 100 * 60; // 100 minutes
    const MAX_SECS = 59;
    
    // Check if time is 0:0
    if (totalSeconds === 0) {
      setExtraTimeError('Invalid input. Time must be greater than 0.');
      return;
    }
    if (secs > MAX_SECS) {
      setExtraTimeError('Invalid input. Maximum seconds is 59.');
      return;
    }
    if (totalSeconds > MAX_SECONDS) {
      setExtraTimeError('Invalid input. Maximum extra time is 100 minutes.');
      return;
    }
    
    addExtraTimeAndClose(totalSeconds, mins, secs);
  };

  const addExtraTimeAndClose = (totalSeconds: number, mins: number, secs: number) => {
    // snapshot when extra time starts so Reset can restore the background clock
    extraTimeStartMatchElapsedRef.current = Math.round(matchElapsedRef.current);
    // mark extra-time active synchronously so immediate events use correct time
    inExtraTimeRef.current = true;
    timer.addTime(totalSeconds);
    setStoppageTimeAdded(prev => prev + totalSeconds);
    // Log extra time event at the end of the regular half (start of stoppage time)
    const baseBeforeCurrentHalf = (() => {
      let base = 0;
      if (matchData.currentHalf >= 2) base += settings.halfDuration; // Half 1
      if (matchData.currentHalf >= 3) base += settings.halfDuration; // Half 2
      if (matchData.currentHalf >= 4) base += customHalfDurations[3] || settings.extraHalfDuration; // Half 3
      return base;
    })();
    let currentHalfDuration = settings.halfDuration;
    if (matchData.currentHalf === 3 || matchData.currentHalf === 4) {
      currentHalfDuration = customHalfDurations[matchData.currentHalf] || settings.extraHalfDuration;
    }
    // Use the actual elapsed match time (synchronous ref) for logging
    const eventTime = Math.round(matchElapsedRef.current);
    addEvent(EventType.EXTRA_TIME, eventTime, undefined, `${mins}m ${secs}s added`);
    setMatchData(prev => ({...prev, status: 'extra-time'}));
    setIsExtraTimeModalOpen(false);
    setExtraTimeInput({ minutes: '', seconds: '' });
    setExtraTimeError('');
  };

  const addQuickExtraTime = (totalSeconds: number, mins: number, secs: number) => {
    // snapshot when quick extra time starts
    extraTimeStartMatchElapsedRef.current = Math.round(matchElapsedRef.current);
    inExtraTimeRef.current = true;
    timer.addTime(totalSeconds);
    setStoppageTimeAdded(prev => prev + totalSeconds);
    // Log extra time at end of regular half (start of stoppage time)
    const baseBeforeCurrentHalf = (() => {
      let base = 0;
      if (matchData.currentHalf >= 2) base += settings.halfDuration;
      if (matchData.currentHalf >= 3) base += settings.halfDuration;
      if (matchData.currentHalf >= 4) base += customHalfDurations[3] || settings.extraHalfDuration;
      return base;
    })();
    let currentHalfDuration = settings.halfDuration;
    if (matchData.currentHalf === 3 || matchData.currentHalf === 4) {
      currentHalfDuration = customHalfDurations[matchData.currentHalf] || settings.extraHalfDuration;
    }
    const eventTime = Math.round(matchElapsedRef.current);
    addEvent(EventType.EXTRA_TIME, eventTime, undefined, `${mins}m ${secs}s added`);
    setIsExtraTimeModalOpen(false);
    setExtraTimeInput({ minutes: '', seconds: '' });
    setExtraTimeError('');
  };
  
  // When declining extra time, proceed to next phase (next half or end game)
  const handleDeclineExtraTime = useCallback(() => {
    setIsExtraTimeModalOpen(false);
    setExtraTimeInput({ minutes: '', seconds: '' });
    setExtraTimeError('');
    // user declined extra time, move on
    inExtraTimeRef.current = false;
    setStoppageTimeAdded(0);
    // Now the half is truly over — log HALF_END and then proceed
    addEvent(EventType.HALF_END, calculateCurrentGameTime(), undefined, `End of Half ${matchData.currentHalf}`);
    proceedToNextPhase();
  }, [addEvent, calculateCurrentGameTime, matchData.currentHalf, proceedToNextPhase]);

  // Validate and confirm extra half duration
  const handleConfirmExtraHalf = () => {
    // Check if inputs are blank
    if (extraHalfInput.minutes === '' || extraHalfInput.seconds === '') {
      setExtraHalfError('Please enter both minutes and seconds.');
      return;
    }
    // Check if inputs are valid integers
    if (!Number.isInteger(Number(extraHalfInput.minutes))) {
      setExtraHalfError('Invalid input. Minutes must be a whole number.');
      return;
    }
    if (!Number.isInteger(Number(extraHalfInput.seconds))) {
      setExtraHalfError('Invalid input. Seconds must be a whole number.');
      return;
    }

    const mins = parseInt(extraHalfInput.minutes);
    const secs = parseInt(extraHalfInput.seconds);
    const total = mins * 60 + secs;
    const MAX_SECONDS = 100 * 60;
    const MAX_SECS = 59;
    
    // Check if time is 0:0
    if (total === 0) {
      setExtraHalfError('Invalid input. Time must be greater than 0.');
      return;
    }
    if (secs > MAX_SECS) {
      setExtraHalfError('Invalid input. Maximum seconds is 59.');
      return;
    }
    if (total > MAX_SECONDS) {
      setExtraHalfError('Invalid input. Maximum half duration is 100 minutes.');
      return;
    }
    // Store custom duration for this half so reset uses it
    setCustomHalfDurations(prev => {
      const updated = { ...prev, [pendingHalf!]: total };
      // If confirming Half 3, automatically set Half 4 to the same duration
      if (pendingHalf === 3) {
        updated[4] = total;
      }
      return updated;
    });
    // Prepare next half, do not start timer
    setMatchData(prev => ({
      ...prev,
      currentHalf: pendingHalf!,
      status: 'in-progress',
    }));
    // mark the start of this extra half in the elapsed timeline
    currentHalfStartMatchElapsedRef.current = Math.round(matchElapsedRef.current);
    timer.reset(total);
    setIsExtraHalfModalOpen(false);
    setExtraHalfInput({ minutes: '', seconds: '' });
    setExtraHalfError('');
    // If this was Half 3, automatically prepare Half 4 with the same duration
    if (pendingHalf === 3) {
      setPendingHalf(null);
    } else {
      setPendingHalf(null);
    }
  };

  // End game from extra half modal (user clicks "End Game" button)
  const handleEndGameFromExtraHalf = () => {
    setIsExtraHalfModalOpen(false);
    setExtraHalfInput({ minutes: '', seconds: '' });
    setExtraHalfError('');
    setPendingHalf(null);
    // End the game
    inExtraTimeRef.current = false;
    setMatchData(prev => ({ ...prev, status: 'full-time' }));
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
          {activeTab === 'game' && (
            <GameTab 
              matchData={matchData} 
              timer={timer} 
              settings={settings} 
              customHalfDurations={customHalfDurations} 
              onScore={handleScore} 
              onRemoveGoal={handleRemoveGoal} 
              onCard={(team, card) => setCardModalInfo({team, card})} 
              onPlay={handlePlay} 
              onFinishHalf={handleManualFinishHalf} 
              onStartNextHalf={handleStartNextHalf} 
              onResetTimer={(duration: number) => {
                // Reset visible timer and restore background clock snapshot
                timer.reset(duration);
                if (inExtraTimeRef.current) {
                  matchElapsedRef.current = extraTimeStartMatchElapsedRef.current;
                } else {
                  matchElapsedRef.current = currentHalfStartMatchElapsedRef.current;
                }
              }}
              onSelectKickoff={handleKickoffSelect} 
              onGoToCoinFlip={() => setActiveTab('coin-flip')} 
            />
          )}
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
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-gray-700">Quick Options</p>
              <div className="grid grid-cols-3 gap-2">
                {settings.quickExtraTime.map((time, idx) => {
                  const mins = Math.floor(time / 60);
                  const secs = time % 60;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        addQuickExtraTime(time, mins, secs);
                      }}
                      className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-bold py-2 px-3 rounded-lg transition text-sm"
                    >
                      +{mins}m {secs}s
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-sm font-semibold text-gray-700 mb-2">Custom Time</p>
              <div className="flex items-center space-x-2">
                <input type="number" min={0} max={100} placeholder="Mins" value={extraTimeInput.minutes} onChange={(e) => { setExtraTimeInput(p => ({...p, minutes: e.target.value})); setExtraTimeError(''); }} className="w-full p-2 border rounded-md text-center" />
                <span className="font-bold text-lg">:</span>
                <input type="number" min={0} max={59} placeholder="Secs" value={extraTimeInput.seconds} onChange={(e) => { setExtraTimeInput(p => ({...p, seconds: e.target.value})); setExtraTimeError(''); }} className="w-full p-2 border rounded-md text-center" />
              </div>
            </div>
            {extraTimeError && <p className="text-sm text-red-500 error-text">{extraTimeError}</p>}
            <button onClick={handleAddExtraTime} disabled={extraTimeInput.minutes === '' || extraTimeInput.seconds === '' || extraTimeError !== ''} className="w-full bg-yellow-400 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-yellow-500 transition disabled:bg-gray-300 disabled:cursor-not-allowed">Add Time</button>
            <button onClick={handleDeclineExtraTime} className="w-full bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300 transition">No</button>
          </div>
        </Modal>

        {/* Extra Half Modal for 3rd/4th half */}
        <Modal isOpen={isExtraHalfModalOpen} onClose={() => setIsExtraHalfModalOpen(false)} title={`Enter time for Half ${pendingHalf}`}> 
          <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input type="number" min={0} max={100} placeholder="Mins" value={extraHalfInput.minutes} onChange={(e) => { setExtraHalfInput(p => ({...p, minutes: e.target.value})); setExtraHalfError(''); }} className="w-full p-2 border rounded-md text-center" />
            <span className="font-bold text-lg">:</span>
            <input type="number" min={0} max={59} placeholder="Secs" value={extraHalfInput.seconds} onChange={(e) => { setExtraHalfInput(p => ({...p, seconds: e.target.value})); setExtraHalfError(''); }} className="w-full p-2 border rounded-md text-center" />
          </div>
          {extraHalfError && <p className="text-sm text-red-500 error-text">{extraHalfError}</p>}
          <button onClick={handleConfirmExtraHalf} disabled={extraHalfInput.minutes === '' || extraHalfInput.seconds === '' || extraHalfError !== ''} className="w-full bg-yellow-400 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-yellow-500 transition disabled:bg-gray-300 disabled:cursor-not-allowed">Ok</button>
          <button onClick={handleEndGameFromExtraHalf} className="w-full bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300 transition">End Game</button>
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
    settings: Settings,
    customHalfDurations: { [key: number]: number },
    onScore: (t: Team) => void, 
    onRemoveGoal: (t: Team) => void,
    onCard: (t: Team, c: 'yellow'|'red') => void, 
    onPlay: ()=>void, 
    onFinishHalf: ()=>void,
    onStartNextHalf: ()=>void,
      onResetTimer: (duration: number) => void,
      onSelectKickoff: (t: Team) => void,
      onGoToCoinFlip: () => void,
  }> = (props) => {
    const { matchData, timer, settings, customHalfDurations, onScore, onRemoveGoal, onCard, onPlay, onFinishHalf, onStartNextHalf, onResetTimer, onSelectKickoff, onGoToCoinFlip } = props;

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
          <button onClick={() => {
            let resetDuration = settings.halfDuration;
            if (matchData.currentHalf === 3 || matchData.currentHalf === 4) {
              resetDuration = customHalfDurations[matchData.currentHalf] || settings.extraHalfDuration;
            }
            onResetTimer(resetDuration);
          }} className="p-3 bg-yellow-400 text-gray-800 rounded-full hover:bg-yellow-500 transition reset-btn timer-btn" aria-label="Reset"><span className="text-sm font-semibold">Reset</span></button>
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
  const [showExtraHalfDurationPrompt, setShowExtraHalfDurationPrompt] = useState(false);
  const [showQuickExtraTimePrompt, setShowQuickExtraTimePrompt] = useState(false);

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
      // Check if inputs are valid integers
      if (mins && !Number.isInteger(Number(mins))) {
        setError('Invalid input. Minutes and seconds must be whole numbers.');
        return;
      }
      if (secs && !Number.isInteger(Number(secs))) {
        setError('Invalid input. Minutes and seconds must be whole numbers.');
        return;
      }
      
      const m = parseInt(mins) || 0;
      const s = parseInt(secs) || 0;
      const total = (m * 60) + s;
      const MAX_SECONDS = 100 * 60; // 100 minutes
      const MAX_SECS = 59;
      
      if (total <= 0) {
        setError('Invalid time entered');
        return;
      }
      if (s > MAX_SECS) {
        setError('Invalid input. Maximum seconds is 59.');
        return;
      }
      if (total > MAX_SECONDS) {
        setError('Invalid input. Maximum halftime is 100 minutes.');
        return;
      }
      
      // All validation passed, confirm
      onConfirm(total);
    };

    const canConfirm = mins !== '' && secs !== '' && !error;

    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <input type="number" min={0} max={100} value={mins} onChange={(e) => { setMins(e.target.value); setError(''); }} className="w-1/2 p-2 border rounded-md" placeholder="Mins" />
          <input type="number" min={0} max={59} value={secs} onChange={(e) => { setSecs(e.target.value); setError(''); }} className="w-1/2 p-2 border rounded-md" placeholder="Secs" />
        </div>
        {error && <p className="text-sm text-red-500 error-text">{error}</p>}
        <div className="flex justify-end space-x-2">
          <button onClick={onCancel} className="px-4 py-2 bg-gray-200 rounded-md">Cancel</button>
          <button onClick={handleConfirm} disabled={!canConfirm} className="px-4 py-2 bg-yellow-400 text-gray-800 rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed">Confirm</button>
        </div>
      </div>
    );
  };

  // --- Quick Extra Time prompt component (local) ---
  const QuickExtraTimePrompt: React.FC<{ initialTimes: number[]; onCancel: () => void; onConfirm: (times: number[]) => void }> = ({ initialTimes, onCancel, onConfirm }) => {
    const initialMins = initialTimes.map(t => Math.floor(t / 60));
    const initialSecs = initialTimes.map(t => t % 60);
    const [mins, setMins] = useState<string[]>(initialMins.map(m => String(m)));
    const [secs, setSecs] = useState<string[]>(initialSecs.map(s => String(s)));
    const [error, setError] = useState('');

    const handleConfirm = () => {
      // Validate all 3 options
      for (let i = 0; i < 3; i++) {
        if (mins[i] && !Number.isInteger(Number(mins[i]))) {
          setError('Invalid input. Minutes and seconds must be whole numbers.');
          return;
        }
        if (secs[i] && !Number.isInteger(Number(secs[i]))) {
          setError('Invalid input. Minutes and seconds must be whole numbers.');
          return;
        }
      }

      const times = mins.map((m, i) => {
        const minute = parseInt(m) || 0;
        const second = parseInt(secs[i]) || 0;
        return (minute * 60) + second;
      });

      for (let time of times) {
        if (time <= 0) {
          setError('Invalid time entered');
          return;
        }
        if (time % 60 > 59) {
          setError('Invalid input. Maximum seconds is 59.');
          return;
        }
        if (time > 100 * 60) {
          setError('Invalid input. Maximum extra time is 100 minutes.');
          return;
        }
      }

      // All validation passed, confirm
      onConfirm(times);
    };

    const canConfirm = mins.every((m, i) => m !== '' && secs[i] !== '') && !error;

    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Set 3 quick extra time options</p>
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="space-y-2">
            <label className="block text-xs font-medium text-gray-700">Option {idx + 1}</label>
            <div className="flex items-center space-x-2">
              <input 
                type="number" 
                min={0} 
                max={100} 
                value={mins[idx]} 
                onChange={(e) => { setMins(prev => { const newMins = [...prev]; newMins[idx] = e.target.value; return newMins; }); setError(''); }} 
                className="w-1/2 p-2 border rounded-md text-center" 
                placeholder="Mins" 
              />
              <span className="font-bold text-lg">:</span>
              <input 
                type="number" 
                min={0} 
                max={59} 
                value={secs[idx]} 
                onChange={(e) => { setSecs(prev => { const newSecs = [...prev]; newSecs[idx] = e.target.value; return newSecs; }); setError(''); }} 
                className="w-1/2 p-2 border rounded-md text-center" 
                placeholder="Secs" 
              />
            </div>
          </div>
        ))}
        {error && <p className="text-sm text-red-500 error-text">{error}</p>}
        <div className="flex justify-end space-x-2">
          <button onClick={onCancel} className="px-4 py-2 bg-gray-200 rounded-md">Cancel</button>
          <button onClick={handleConfirm} disabled={!canConfirm} className="px-4 py-2 bg-yellow-400 text-gray-800 rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed">Confirm</button>
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
        <div>
          <label className="block text-sm font-medium text-gray-700">Extra Half Duration (3rd/4th Half)</label>
            <div className="mt-1 flex items-center" style={{ gap: '0.75rem' }}>
            <div className="text-lg font-semibold text-gray-700">{Math.floor(settings.extraHalfDuration / 60)}m {settings.extraHalfDuration % 60}s</div>
            <div style={{ marginLeft: 'auto' }}>
              <button
                type="button"
                onClick={() => setShowExtraHalfDurationPrompt(true)}
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
        <div>
          <label className="block text-sm font-medium text-gray-700">Quick Extra Time</label>
            <div className="mt-1 flex items-center" style={{ gap: '0.75rem' }}>
            <div className="text-lg font-semibold text-gray-700">{Math.floor(settings.quickExtraTime[0] / 60)}m, {Math.floor(settings.quickExtraTime[1] / 60)}m, {Math.floor(settings.quickExtraTime[2] / 60)}m</div>
            <div style={{ marginLeft: 'auto' }}>
              <button
                type="button"
                onClick={() => setShowQuickExtraTimePrompt(true)}
                className={`inline-flex items-center px-3 py-1.5 rounded-md border bg-yellow-400 hover:bg-yellow-500 transition ${settings.theme === 'dark' ? 'text-white border-yellow-500' : 'text-gray-900 border-yellow-600'}`}
                style={{ transform: 'translateX(6px)' }}
              >
                Edit
              </button>
            </div>
          </div>
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
      {/* Extra Half Duration Prompt Modal */}
      <Modal isOpen={showExtraHalfDurationPrompt} onClose={() => setShowExtraHalfDurationPrompt(false)} title="Set Extra Half Duration (3rd/4th Half)">
          <DurationPrompt
            initialSeconds={settings.extraHalfDuration}
            onCancel={() => setShowExtraHalfDurationPrompt(false)}
            onConfirm={(seconds) => { setSettings(s => ({...s, extraHalfDuration: seconds})); setShowExtraHalfDurationPrompt(false); }}
          />
      </Modal>

      {/* Quick Extra Time Prompt Modal */}
      <Modal isOpen={showQuickExtraTimePrompt} onClose={() => setShowQuickExtraTimePrompt(false)} title="Set Quick Extra Time">
          <QuickExtraTimePrompt
            initialTimes={settings.quickExtraTime}
            onCancel={() => setShowQuickExtraTimePrompt(false)}
            onConfirm={(times) => { setSettings(s => ({...s, quickExtraTime: times})); setShowQuickExtraTimePrompt(false); }}
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
