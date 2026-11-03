import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, Users, Battery, Shield, Share2, Navigation, 
  Compass, Radio, Layers, Smartphone, RefreshCw, Check, AlertTriangle, Play, Pause, FastForward
} from 'lucide-react';

export default function App() {
  // 상태 관리
  const [activeTab, setActiveTab] = useState('map'); // 'map' | 'members' | 'gps' | 'setup'
  const [channelCode, setChannelCode] = useState('SEOUL-HQ-01');
  const [isLiveGpsActive, setIsLiveGpsActive] = useState(false);
  const [myLocation, setMyLocation] = useState({ lat: 37.5665, lng: 126.9780, name: '현재 내 위치 (서울 시청)' });
  const [batteryLevel, setBatteryLevel] = useState(88);
  const [isCharging, setIsCharging] = useState(false);
  const [mapTheme, setMapTheme] = useState('voyager'); // 'voyager' | 'osm' | 'dark'
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(true);
  const [isSimulationRunning, setIsSimulationRunning] = useState(true);
  const [simSpeed, setSimSpeed] = useState(1);
  const [isGalaxyView, setIsGalaxyView] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // 가상 구성원 상태 (서울 주요 거점)
  const [members, setMembers] = useState([
    { id: 1, name: '김현수 (팀장)', role: '현장 지휘', lat: 37.5133, lng: 127.1000, status: '이동 중', battery: 92, updated: '방금 전', color: 'bg-emerald-500' },
    { id: 2, name: '이지은 (기술)', role: '설비 점검', lat: 37.5512, lng: 126.9882, status: '작업 중', battery: 78, updated: '1분 전', color: 'bg-blue-500' },
    { id: 3, name: '박민수 (지원)', role: '자재 운반', lat: 37.4980, lng: 127.0276, status: '대기 중', battery: 64, updated: '3분 전', color: 'bg-amber-500' },
    { id: 4, name: '정수진 (안전)', role: '안전 감시', lat: 37.5796, lng: 126.9770, status: '순찰 중', battery: 85, updated: '방금 전', color: 'bg-purple-500' },
  ]);

  // 토스트 알림 표시 함수
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // 갤럭시 배터리 API 연동
  useEffect(() => {
    if (navigator.getBattery) {
      navigator.getBattery().then(battery => {
        setBatteryLevel(Math.round(battery.level * 100));
        setIsCharging(battery.charging);
        
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
        battery.addEventListener('chargingchange', () => {
          setIsCharging(battery.charging);
        });
      }).catch(() => {});
    }
  }, []);

  // 화면 꺼짐 방지 (WakeLock API)
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isLiveGpsActive) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {}
      }
    };
    requestWakeLock();
    return () => {
      if (wakeLock) wakeLock.release();
    };
  }, [isLiveGpsActive]);

  // 가상 팀원 움직임 시뮬레이션
  useEffect(() => {
    if (!isSimulationRunning) return;
    const interval = setInterval(() => {
      setMembers(prev => prev.map(m => ({
        ...m,
        lat: m.lat + (Math.random() - 0.5) * 0.001 * simSpeed,
        lng: m.lng + (Math.random() - 0.5) * 0.001 * simSpeed,
      })));
    }, 2500);
    return () => clearInterval(interval);
  }, [isSimulationRunning, simSpeed]);

  // 실제 GPS 추적 시작
  const toggleLiveGps = () => {
    if (!isLiveGpsActive) {
      if (!navigator.geolocation) {
        alert('이 기기에서는 위치 정보(GPS)를 지원하지 않습니다.');
        return;
      }
      navigator.geolocation.watchPosition(
        (position) => {
          setMyLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            name: '내 실시간 갤럭시 위치'
          });
          setIsLiveGpsActive(true);
          showToast('🛰️ 갤럭시 실시간 GPS 추적 중');
        },
        (error) => {
          alert('GPS 권한이 거부되었거나 위치를 가져올 수 없습니다.');
          setIsLiveGpsActive(false);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    } else {
      setIsLiveGpsActive(false);
      showToast('GPS 추적이 일시중지되었습니다.');
    }
  };

  // SOS 긴급 알림
  const triggerSos = () => {
    if (navigator.vibrate) {
      navigator.vibrate([300, 100, 300, 100, 500]); // 갤럭시에 진동 햅틱 울림
    }
    showToast('🚨 긴급 SOS 신호가 채널 멤버들에게 전송되었습니다!');
  };

  // 링크 공유
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'GeoPulse 실시간 위치 공유',
        text: `[${channelCode}] 그룹 채널에 참여하세요!`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      showToast('📋 링크가 클립보드에 복사되었습니다.');
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* PC에서 볼 때 갤럭시 스마트폰 프레임 미리보기 토글 가능 */}
      <div className={`w-full ${isGalaxyView ? 'max-w-[420px] h-[880px] rounded-[40px] border-[12px] border-slate-800 shadow-2xl overflow-hidden relative flex flex-col' : 'max-w-2xl h-screen flex flex-col'} bg-slate-900`}>
        
        {/* 상단 앱바 (One UI 스타일) */}
        <header className="bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between z-20">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Radio className="w-4 h-4 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">GeoPulse Live</h1>
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-[11px] text-slate-400">채널: {channelCode}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button onClick={triggerSos} className="bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center space-x-1 active:scale-95 transition">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>SOS</span>
            </button>
            <button onClick={handleShare} className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition">
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 토스트 메시지 알림 */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 text-slate-100 px-4 py-2 rounded-2xl shadow-xl text-xs flex items-center space-x-2 animate-bounce">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* 메인 콘텐츠 영역 (탭별 화면) */}
        <main className="flex-1 relative overflow-hidden flex flex-col">
          
          {/* 1탭: 실시간 지도 대시보드 */}
          {activeTab === 'map' && (
            <div className="absolute inset-0 flex flex-col bg-slate-950">
              {/* 가상 지도 화면 */}
              <div className="flex-1 relative bg-slate-900 overflow-hidden flex items-center justify-center">
                {/* 배경 격자 무늬 지도 느낌 */}
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:24px_24px]"></div>
                
                {/* 중앙 지도 컨트롤 뱃지 */}
                <div className="absolute top-4 left-4 z-10 bg-slate-900/80 backdrop-blur border border-slate-800 p-2 rounded-xl text-xs space-y-1">
                  <div className="text-slate-400">지도 테마: <span className="text-indigo-400 font-bold">서울 관제센터</span></div>
                  <div className="text-slate-400">접속자: <span className="text-emerald-400 font-bold">{members.length + 1}명 실시간</span></div>
                </div>

                {/* 내 위치 마커 */}
                <div className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500" style={{ top: '52%', left: '48%' }}>
                  <div className="relative flex items-center justify-center">
                    <span className="absolute w-12 h-12 rounded-full bg-blue-500/30 animate-ping"></span>
                    <div className="w-8 h-8 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold">
                      나
                    </div>
                  </div>
                </div>

                {/* 다른 팀원 마커들 */}
                {members.map((m, idx) => (
                  <div key={m.id} className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-1000" style={{ top: `${40 + idx * 12}%`, left: `${30 + idx * 15}%` }}>
                    <div className="flex flex-col items-center group cursor-pointer">
                      <div className="bg-slate-900/90 text-[10px] px-2 py-0.5 rounded-md border border-slate-700 shadow mb-1 whitespace-nowrap">
                        {m.name} ({m.status})
                      </div>
                      <div className={`w-7 h-7 rounded-full ${m.color} border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold`}>
                        {m.name[0]}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 하단 바텀시트 (구성원 요약 슬라이드) */}
              <div className="bg-slate-900/95 backdrop-blur border-t border-slate-800 p-4 rounded-t-3xl shadow-2xl">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">채널 구성원 실시간 상태</h3>
                  <span className="text-[11px] text-emerald-400 font-medium">● 정상 수신 중</span>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center justify-between bg-slate-800/60 border border-slate-700/50 p-2.5 rounded-2xl">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-xl ${m.color} flex items-center justify-center font-bold text-xs text-white`}>
                          {m.name[0]}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-200">{m.name}</div>
                          <div className="text-[11px] text-slate-400">{m.role} · {m.status}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-semibold text-emerald-400">{m.battery}% 🔋</div>
                        <div className="text-[10px] text-slate-500">{m.updated}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2탭: 구성원 상세 목록 및 채널 관리 */}
          {activeTab === 'members' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <h2 className="text-sm font-bold mb-2">그룹 채널 설정</h2>
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    value={channelCode} 
                    onChange={(e) => setChannelCode(e.target.value)} 
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                  />
                  <button onClick={() => showToast('채널이 변경되었습니다.')} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-xs font-bold transition">
                    변경
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-bold text-slate-300">현재 채널 접속 멤버 ({members.length + 1})</h2>
                {members.map(m => (
                  <div key={m.id} className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-2xl ${m.color} flex items-center justify-center font-bold text-sm text-white`}>
                        {m.name[0]}
                      </div>
                      <div>
                        <div className="text-xs font-bold">{m.name}</div>
                        <div className="text-[11px] text-slate-400">{m.role}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-emerald-400 font-semibold">{m.battery}% 배터리</div>
                      <div className="text-[10px] text-slate-500">{m.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3탭: 내 갤럭시 GPS 및 하드웨어 제어 */}
          {activeTab === 'gps' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold flex items-center space-x-2">
                    <Navigation className="w-4 h-4 text-indigo-400" />
                    <span>갤럭시 하드웨어 센서 연동</span>
                  </h2>
                  <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${isLiveGpsActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                    {isLiveGpsActive ? 'GPS 추적 켜짐' : '일시중지됨'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-[11px] text-slate-400">실시간 배터리</div>
                    <div className="text-base font-bold text-emerald-400 mt-1">{batteryLevel}% {isCharging ? '⚡충전중' : ''}</div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-[11px] text-slate-400">화면 꺼짐 방지</div>
                    <div className="text-base font-bold text-indigo-400 mt-1">활성화됨</div>
                  </div>
                </div>

                <button 
                  onClick={toggleLiveGps} 
                  className={`w-full py-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${isLiveGpsActive ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                >
                  <MapPin className="w-4 h-4" />
                  <span>{isLiveGpsActive ? '실시간 GPS 추적 끄기' : '실시간 갤럭시 GPS 켜기'}</span>
                </button>
              </div>

              {/* 시뮬레이션 설정 */}
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
                <h2 className="text-sm font-bold">동작 시뮬레이션 제어</h2>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">가상 팀원 이동 시뮬레이션</span>
                  <button 
                    onClick={() => setIsSimulationRunning(!isSimulationRunning)} 
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold ${isSimulationRunning ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}
                  >
                    {isSimulationRunning ? '일시정지' : '재개'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4탭: 앱 설치 및 APK / PWA 안내 */}
          {activeTab === 'setup' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
                <h2 className="text-sm font-bold flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-indigo-400" />
                  <span>갤럭시 스마트폰 앱 설치 방법</span>
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  삼성 인터넷 또는 크롬 브라우저 우측 상단 메뉴(⋮)에서 <b>[홈 화면에 추가]</b> 또는 <b>[앱 설치]</b>를 누르면 바탕화면에 네이티브 앱처럼 설치됩니다.
                </p>
                <div className="pt-2 border-t border-slate-800">
                  <button 
                    onClick={() => setIsGalaxyView(!isGalaxyView)} 
                    className="w-full bg-slate-800 hover:bg-slate-700 py-2.5 rounded-xl text-xs font-semibold text-slate-200 transition"
                  >
                    {isGalaxyView ? 'PC 화면 모드로 전환' : 'Galaxy S24 뷰어로 미리보기'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>

        {/* 하단 네비게이션 바 (One UI 모바일 스타일) */}
        <nav className="bg-slate-900/95 backdrop-blur border-t border-slate-800 py-2 px-6 flex justify-between items-center z-20">
          <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center space-y-1 ${activeTab === 'map' ? 'text-indigo-400' : 'text-slate-400'}`}>
            <MapPin className="w-5 h-5" />
            <span className="text-[10px] font-medium">지도</span>
          </button>
          <button onClick={() => setActiveTab('members')} className={`flex flex-col items-center space-y-1 ${activeTab === 'members' ? 'text-indigo-400' : 'text-slate-400'}`}>
            <Users className="w-5 h-5" />
            <span className="text-[10px] font-medium">구성원</span>
          </button>
          <button onClick={() => setActiveTab('gps')} className={`flex flex-col items-center space-y-1 ${activeTab === 'gps' ? 'text-indigo-400' : 'text-slate-400'}`}>
            <Navigation className="w-5 h-5" />
            <span className="text-[10px] font-medium">내 GPS</span>
          </button>
          <button onClick={() => setActiveTab('setup')} className={`flex flex-col items-center space-y-1 ${activeTab === 'setup' ? 'text-indigo-400' : 'text-slate-400'}`}>
            <Smartphone className="w-5 h-5" />
            <span className="text-[10px] font-medium">설치/앱</span>
          </button>
        </nav>

      </div>
    </div>
  );
}
