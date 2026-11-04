import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, Users, Battery, Shield, Share2, Navigation, 
  Compass, Radio, Layers, Smartphone, RefreshCw, Check, AlertTriangle, Play, Pause, Building2
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('map'); // 'map' | 'members' | 'gps' | 'setup'
  const [channelCode, setChannelCode] = useState('SEOUL-HQ-01');
  const [isLiveGpsActive, setIsLiveGpsActive] = useState(false);
  const [myLocation, setMyLocation] = useState({ lat: 37.5665, lng: 126.9780, name: '서울시청 (내 위치)' });
  const [batteryLevel, setBatteryLevel] = useState(88);
  const [isCharging, setIsCharging] = useState(false);
  const [isSimulationRunning, setIsSimulationRunning] = useState(true);
  const [isGalaxyView, setIsGalaxyView] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [naverClientIdInput, setNaverClientIdInput] = useState('');
  const [isNaverLoaded, setIsNaverLoaded] = useState(false);

  const mapElement = useRef(null);
  const mapInstance = useRef(null);

  // 가상 구성원 상태 (서울 주요 거점 상가 및 빌딩 주변)
  const [members, setMembers] = useState([
    { id: 1, name: '김현수 (팀장)', role: '현장 지휘', lat: 37.5651, lng: 126.9772, status: '이동 중 (시청역 5번 출구 앞)', battery: 92, updated: '방금 전', color: 'bg-emerald-500' },
    { id: 2, name: '이지은 (기술)', role: '설비 점검', lat: 37.5692, lng: 126.9788, status: '작업 중 (대한문 상가 빌딩)', battery: 78, updated: '1분 전', color: 'bg-blue-500' },
    { id: 3, name: '박민수 (지원)', role: '자재 운반', lat: 37.5635, lng: 126.9820, status: '대기 중 (을지로입구 롯데백화점)', battery: 64, updated: '3분 전', color: 'bg-amber-500' },
    { id: 4, name: '정수진 (안전)', role: '안전 감시', lat: 37.5700, lng: 126.9750, status: '순찰 중 (광화문광장 세종대왕상)', battery: 85, updated: '방금 전', color: 'bg-purple-500' },
  ]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // 갤럭시 배터리 및 화면 꺼짐 방지 연동
  useEffect(() => {
    if (navigator.getBattery) {
      navigator.getBattery().then(battery => {
        setBatteryLevel(Math.round(battery.level * 100));
        setIsCharging(battery.charging);
        battery.addEventListener('levelchange', () => setBatteryLevel(Math.round(battery.level * 100)));
        battery.addEventListener('chargingchange', () => setIsCharging(battery.charging));
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isLiveGpsActive) {
        try { wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
      }
    };
    requestWakeLock();
    return () => { if (wakeLock) wakeLock.release(); };
  }, [isLiveGpsActive]);

  // 가상 팀원 움직임 시뮬레이션
  useEffect(() => {
    if (!isSimulationRunning) return;
    const interval = setInterval(() => {
      setMembers(prev => prev.map(m => ({
        ...m,
        lat: m.lat + (Math.random() - 0.5) * 0.0005,
        lng: m.lng + (Math.random() - 0.5) * 0.0005,
      })));
    }, 3000);
    return () => clearInterval(interval);
  }, [isSimulationRunning]);

  // 네이버 지도 SDK 동적 로드 (Client ID 입력 시 실행)
  const initNaverMap = (clientId) => {
    if (window.naver && window.naver.maps) {
      setIsNaverLoaded(true);
      renderMap();
      return;
    }
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${clientId}`;
    script.async = true;
    script.onload = () => {
      setIsNaverLoaded(true);
      showToast('🗺️ 네이버 지도 API가 연동되었습니다!');
      renderMap();
    };
    script.onerror = () => {
      alert('네이버 지도 Client ID가 올바르지 않거나 로드에 실패했습니다.');
    };
    document.head.appendChild(script);
  };

  const renderMap = () => {
    if (!mapElement.current || !window.naver) return;
    const mapOptions = {
      center: new window.naver.maps.LatLng(myLocation.lat, myLocation.lng),
      zoom: 16,
      scaleControl: true,
      logoControl: true,
      mapDataControl: true
    };
    mapInstance.current = new window.naver.maps.Map(mapElement.current, mapOptions);
  };

  // 실제 GPS 추적
  const toggleLiveGps = () => {
    if (!isLiveGpsActive) {
      if (!navigator.geolocation) {
        alert('이 기기에서는 위치 정보를 지원하지 않습니다.');
        return;
      }
      navigator.geolocation.watchPosition(
        (position) => {
          const newLat = position.coords.latitude;
          const newLng = position.coords.longitude;
          setMyLocation({ lat: newLat, lng: newLng, name: '내 실시간 갤럭시 위치' });
          setIsLiveGpsActive(true);
          showToast('🛰️ 실시간 GPS 및 상가 위치 추적 중');
          if (mapInstance.current && window.naver) {
            mapInstance.current.setCenter(new window.naver.maps.LatLng(newLat, newLng));
          }
        },
        () => {
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

  const triggerSos = () => {
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 500]);
    showToast('🚨 긴급 SOS 신호가 전송되었습니다!');
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: 'GeoPulse 실시간 위치', text: `[${channelCode}] 채널 참여`, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      showToast('📋 링크가 복사되었습니다.');
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className={`w-full ${isGalaxyView ? 'max-w-[420px] h-[880px] rounded-[40px] border-[12px] border-slate-800 shadow-2xl overflow-hidden relative flex flex-col' : 'max-w-2xl h-screen flex flex-col'} bg-slate-900`}>
        
        {/* 상단 앱바 */}
        <header className="bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between z-20">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">GeoPulse + 네이버 지도</h1>
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

        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 text-slate-100 px-4 py-2 rounded-2xl shadow-xl text-xs flex items-center space-x-2 animate-bounce">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* 메인 콘텐츠 영역 */}
        <main className="flex-1 relative overflow-hidden flex flex-col">
          
          {/* 1탭: 네이버 지도 화면 */}
          {activeTab === 'map' && (
            <div className="absolute inset-0 flex flex-col bg-slate-950">
              <div className="flex-1 relative bg-slate-900 overflow-hidden">
                {/* 네이버 지도 렌더링 영역 */}
                <div ref={mapElement} className="w-full h-full absolute inset-0"></div>

                {/* API 키가 없을 때 안내 배너 오버레이 */}
                {!isNaverLoaded && (
                  <div className="absolute inset-0 bg-slate-950/90 z-10 flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <Building2 className="w-12 h-12 text-emerald-400 animate-pulse" />
                    <h3 className="text-sm font-bold text-white">네이버 지도 API 연동 필요</h3>
                    <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
                      건물명과 상가 지형지물을 보려면 네이버 클라우드 플랫폼에서 발급받은 <b>Maps Client ID</b>를 입력하세요.
                    </p>
                    <div className="flex w-full max-w-xs space-x-2 pt-2">
                      <input 
                        type="text" 
                        placeholder="Client ID 입력" 
                        value={naverClientIdInput} 
                        onChange={(e) => setNaverClientIdInput(e.target.value)} 
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                      />
                      <button 
                        onClick={() => initNaverMap(naverClientIdInput)} 
                        className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl text-xs font-bold transition text-white"
                      >
                        적용
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-500">※ 입력하지 않아도 아래 시뮬레이션 및 기본 기능은 작동합니다.</span>
                  </div>
                )}

                {/* 시뮬레이션 마커 오버레이 (네이버 지도 위 실시간 표시) */}
                <div className="absolute top-4 left-4 z-10 bg-slate-900/90 backdrop-blur border border-slate-800 p-2.5 rounded-xl text-xs space-y-1 shadow-xl">
                  <div className="text-emerald-400 font-bold flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>상가·건물 실시간 모니터링 중</span>
                  </div>
                  <div className="text-[10px] text-slate-400">접속 구성원: {members.length + 1}명</div>
                </div>
              </div>

              {/* 하단 바텀시트 */}
              <div className="bg-slate-900/95 backdrop-blur border-t border-slate-800 p-4 rounded-t-3xl shadow-2xl z-10">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">구성원별 상세 위치 및 상가 정보</h3>
                  <span className="text-[11px] text-emerald-400 font-medium">● 실시간 갱신</span>
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
                          <div className="text-[11px] text-emerald-400 font-medium">{m.status}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-semibold text-slate-300">{m.battery}% 🔋</div>
                        <div className="text-[10px] text-slate-500">{m.updated}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2탭: 구성원 목록 */}
          {activeTab === 'members' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <h2 className="text-sm font-bold mb-2">그룹 채널 코드</h2>
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    value={channelCode} 
                    onChange={(e) => setChannelCode(e.target.value)} 
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                  />
                  <button onClick={() => showToast('채널이 변경되었습니다.')} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl text-xs font-bold text-white transition">
                    변경
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-bold text-slate-300">구성원 상세 위치 ({members.length + 1})</h2>
                {members.map(m => (
                  <div key={m.id} className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-2xl ${m.color} flex items-center justify-center font-bold text-sm text-white`}>
                        {m.name[0]}
                      </div>
                      <div>
                        <div className="text-xs font-bold">{m.name}</div>
                        <div className="text-[11px] text-emerald-400">{m.status}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-300 font-semibold">{m.battery}% 배터리</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3탭: 내 GPS 및 하드웨어 */}
          {activeTab === 'gps' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
                <h2 className="text-sm font-bold flex items-center space-x-2">
                  <Navigation className="w-4 h-4 text-emerald-400" />
                  <span>갤럭시 센서 및 네이버 지도 연동</span>
                </h2>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-[11px] text-slate-400">실시간 배터리</div>
                    <div className="text-base font-bold text-emerald-400 mt-1">{batteryLevel}% {isCharging ? '⚡충전중' : ''}</div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-[11px] text-slate-400">화면 꺼짐 방지</div>
                    <div className="text-base font-bold text-emerald-400 mt-1">활성화됨</div>
                  </div>
                </div>

                <button 
                  onClick={toggleLiveGps} 
                  className={`w-full py-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${isLiveGpsActive ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                >
                  <MapPin className="w-4 h-4" />
                  <span>{isLiveGpsActive ? '실시간 GPS 추적 끄기' : '실시간 갤럭시 GPS 켜기'}</span>
                </button>
              </div>
            </div>
          )}

          {/* 4탭: 앱 설치 및 설정 */}
          {activeTab === 'setup' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
                <h2 className="text-sm font-bold flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span>스마트폰 앱 설치 방법</span>
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  브라우저 우측 상단 메뉴(⋮)에서 <b>[홈 화면에 추가]</b> 또는 <b>[앱 설치]</b>를 누르면 갤럭시 바탕화면에 네이티브 앱으로 설치됩니다.
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

        {/* 하단 네비게이션 바 */}
        <nav className="bg-slate-900/95 backdrop-blur border-t border-slate-800 py-2 px-6 flex justify-between items-center z-20">
          <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center space-y-1 ${activeTab === 'map' ? 'text-emerald-400' : 'text-slate-400'}`}>
            <MapPin className="w-5 h-5" />
            <span className="text-[10px] font-medium">네이버 지도</span>
          </button>
          <button onClick={() => setActiveTab('members')} className={`flex flex-col items-center space-y-1 ${activeTab === 'members' ? 'text-emerald-400' : 'text-slate-400'}`}>
            <Users className="w-5 h-5" />
            <span className="text-[10px] font-medium">구성원</span>
          </button>
          <button onClick={() => setActiveTab('gps')} className={`flex flex-col items-center space-y-1 ${activeTab === 'gps' ? 'text-emerald-400' : 'text-slate-400'}`}>
            <Navigation className="w-5 h-5" />
            <span className="text-[10px] font-medium">내 GPS</span>
          </button>
          <button onClick={() => setActiveTab('setup')} className={`flex flex-col items-center space-y-1 ${activeTab === 'setup' ? 'text-emerald-400' : 'text-slate-400'}`}>
            <Smartphone className="w-5 h-5" />
            <span className="text-[10px] font-medium">설치/앱</span>
          </button>
        </nav>

      </div>
    </div>
  );
}
