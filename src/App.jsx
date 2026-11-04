import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, Users, Share2, Navigation, 
  Smartphone, Check, AlertTriangle, Building2, KeyRound
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('map');
  const [channelCode, setChannelCode] = useState('SEOUL-HQ-01');
  const [isLiveGpsActive, setIsLiveGpsActive] = useState(false);
  const [myLocation, setMyLocation] = useState({ lat: 37.5665, lng: 126.9780, name: '서울시청 (내 위치)' });
  const [batteryLevel, setBatteryLevel] = useState(88);
  const [isCharging, setIsCharging] = useState(false);
  const [isSimulationRunning, setIsSimulationRunning] = useState(true);
  const [isGalaxyView, setIsGalaxyView] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // 로컬 스토리지에 저장된 Client ID 불러오기
  const [naverClientIdInput, setNaverClientIdInput] = useState(() => {
    return localStorage.getItem('naver_map_client_id') || '';
  });
  const [isNaverLoaded, setIsNaverLoaded] = useState(false);

  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);

  const [members, setMembers] = useState([
    { id: 1, name: '김현수 (팀장)', role: '현장 지휘', lat: 37.5651, lng: 126.9772, status: '이동 중 (시청역 5번 출구 앞)', battery: 92, updated: '방금 전', color: '#10b981' },
    { id: 2, name: '이지은 (기술)', role: '설비 점검', lat: 37.5692, lng: 126.9788, status: '작업 중 (대한문 상가 빌딩)', battery: 78, updated: '1분 전', color: '#3b82f6' },
    { id: 3, name: '박민수 (지원)', role: '자재 운반', lat: 37.5635, lng: 126.9820, status: '대기 중 (을지로입구 롯데백화점)', battery: 64, updated: '3분 전', color: '#f59e0b' },
    { id: 4, name: '정수진 (안전)', role: '안전 감시', lat: 37.5700, lng: 126.9750, status: '순찰 중 (광화문광장 세종대왕상)', battery: 85, updated: '방금 전', color: '#a855f7' },
  ]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // 저장된 Client ID가 있으면 앱 켜질 때 자동 연결
  useEffect(() => {
    const savedId = localStorage.getItem('naver_map_client_id');
    if (savedId) {
      initNaverMap(savedId);
    }
  }, []);

  // 갤럭시 배터리 연동
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

  // 가상 팀원 이동 시뮬레이션
  useEffect(() => {
    if (!isSimulationRunning) return;
    const interval = setInterval(() => {
      setMembers(prev => prev.map(m => ({
        ...m,
        lat: m.lat + (Math.random() - 0.5) * 0.0004,
        lng: m.lng + (Math.random() - 0.5) * 0.0004,
      })));
    }, 3000);
    return () => clearInterval(interval);
  }, [isSimulationRunning]);

  // 네이버 지도 SDK 로드 (신규 콘솔 규격 ncpKeyId 적용)
  const initNaverMap = (rawClientId) => {
    const cleanId = rawClientId.trim();
    if (!cleanId) {
      alert('Client ID를 입력해 주세요.');
      return;
    }

    localStorage.setItem('naver_map_client_id', cleanId);

    // 기존 스크립트가 있으면 제거 후 재로드
    const oldScript = document.getElementById('naver-map-sdk');
    if (oldScript) oldScript.remove();

    const script = document.createElement('script');
    script.id = 'naver-map-sdk';
    script.type = 'text/javascript';
    // 신규 VPC Maps 콘솔은 ncpKeyId 파라미터를 사용합니다
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${cleanId}`;
    script.async = true;
    script.onload = () => {
      setIsNaverLoaded(true);
      showToast('🗺️ 네이버 지도 연동 완료!');
      setTimeout(() => renderMap(), 100);
    };
    script.onerror = () => {
      alert('네이버 지도 스크립트 로드에 실패했습니다. Client ID를 확인해 주세요.');
    };
    document.head.appendChild(script);
  };

  const renderMap = () => {
    if (!mapElement.current || !window.naver || !window.naver.maps) return;
    const mapOptions = {
      center: new window.naver.maps.LatLng(myLocation.lat, myLocation.lng),
      zoom: 16,
      scaleControl: true,
      logoControl: true,
      mapDataControl: true,
      zoomControl: true,
    };
    mapInstance.current = new window.naver.maps.Map(mapElement.current, mapOptions);
    updateMarkers();
  };

  // 지도 위 내 위치 및 구성원 마커 실시간 업데이트
  const updateMarkers = () => {
    if (!mapInstance.current || !window.naver || !window.naver.maps) return;

    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // 내 위치 마커
    const myMarker = new window.naver.maps.Marker({
      position: new window.naver.maps.LatLng(myLocation.lat, myLocation.lng),
      map: mapInstance.current,
      icon: {
        content: `<div style="background:#2563eb;color:white;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);white-space:nowrap;">📍 나 (${batteryLevel}%)</div>`,
        anchor: new window.naver.maps.Point(30, 15),
      }
    });
    markersRef.current.push(myMarker);

    // 구성원 마커들
    members.forEach(m => {
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(m.lat, m.lng),
        map: mapInstance.current,
        icon: {
          content: `<div style="background:${m.color};color:white;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);white-space:nowrap;">${m.name}</div>`,
          anchor: new window.naver.maps.Point(40, 15),
        }
      });
      markersRef.current.push(marker);
    });
  };

  useEffect(() => {
    if (isNaverLoaded && activeTab === 'map') {
      updateMarkers();
    }
  }, [members, myLocation, isNaverLoaded, activeTab]);

  // Client ID 초기화 함수
  const resetClientId = () => {
    localStorage.removeItem('naver_map_client_id');
    setIsNaverLoaded(false);
    setNaverClientIdInput('');
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
          setMyLocation({ lat: newLat, lng: newLng, name: '내 실시간 위치' });
          setIsLiveGpsActive(true);
          showToast('🛰️ 실시간 GPS 위치 추적 중');
          if (mapInstance.current && window.naver) {
            mapInstance.current.setCenter(new window.naver.maps.LatLng(newLat, newLng));
          }
        },
        () => {
          alert('GPS 권한을 허용해 주세요.');
          setIsLiveGpsActive(false);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    } else {
      setIsLiveGpsActive(false);
      showToast('GPS 추적이 일시중지되었습니다.');
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className={`w-full ${isGalaxyView ? 'max-w-[420px] h-[880px] rounded-[40px] border-[12px] border-slate-800 shadow-2xl overflow-hidden relative flex flex-col' : 'max-w-2xl h-screen flex flex-col'} bg-slate-900`}>
        
        {/* 상단 앱바 */}
        <header className="bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between z-20">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg">
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
            {isNaverLoaded && (
              <button onClick={resetClientId} className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs flex items-center space-x-1" title="API 키 재설정">
                <KeyRound className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => showToast('🚨 SOS 긴급 알림 발송!')} className="bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center space-x-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>SOS</span>
            </button>
          </div>
        </header>

        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 text-slate-100 px-4 py-2 rounded-2xl shadow-xl text-xs flex items-center space-x-2">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* 메인 영역 */}
        <main className="flex-1 relative overflow-hidden flex flex-col">
          {activeTab === 'map' && (
            <div className="absolute inset-0 flex flex-col bg-slate-950">
              <div className="flex-1 relative bg-slate-900 overflow-hidden">
                <div ref={mapElement} className="w-full h-full absolute inset-0"></div>

                {!isNaverLoaded && (
                  <div className="absolute inset-0 bg-slate-950/90 z-10 flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <Building2 className="w-12 h-12 text-emerald-400 animate-pulse" />
                    <h3 className="text-sm font-bold text-white">네이버 지도 API 연동</h3>
                    <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
                      발급받은 <b>Client ID</b>를 입력하면 기기에 자동 저장되며 주변 상가와 건물명이 표시됩니다.
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
                  </div>
                )}

                <div className="absolute top-4 left-4 z-10 bg-slate-900/90 backdrop-blur border border-slate-800 p-2.5 rounded-xl text-xs space-y-1 shadow-xl">
                  <div className="text-emerald-400 font-bold flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>상가·건물 실시간 모니터링 중</span>
                  </div>
                  <div className="text-[10px] text-slate-400">접속 구성원: {members.length + 1}명</div>
                </div>
              </div>

              {/* 하단 바텀시트 (클릭 시 해당 팀원 위치로 지도 이동) */}
              <div className="bg-slate-900/95 backdrop-blur border-t border-slate-800 p-4 rounded-t-3xl shadow-2xl z-10">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-slate-300">구성원 클릭 시 해당 상가 위치로 이동</h3>
                  <span className="text-[11px] text-emerald-400 font-medium">● 실시간 갱신</span>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {members.map(m => (
                    <div 
                      key={m.id} 
                      onClick={() => {
                        if (mapInstance.current && window.naver) {
                          mapInstance.current.panTo(new window.naver.maps.LatLng(m.lat, m.lng));
                        }
                      }}
                      className="flex items-center justify-between bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 p-2.5 rounded-2xl cursor-pointer transition"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white" style={{ backgroundColor: m.color }}>
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

          {activeTab === 'members' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-950">
              <h2 className="text-sm font-bold text-slate-300">구성원 상세 위치 ({members.length + 1})</h2>
              {members.map(m => (
                <div key={m.id} className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm text-white" style={{ backgroundColor: m.color }}>
                      {m.name[0]}
                    </div>
                    <div>
                      <div className="text-xs font-bold">{m.name}</div>
                      <div className="text-[11px] text-emerald-400">{m.status}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-300 font-semibold">{m.battery}% 🔋</div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'gps' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
                <h2 className="text-sm font-bold">내 갤럭시 실시간 GPS 제어</h2>
                <button 
                  onClick={toggleLiveGps} 
                  className={`w-full py-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${isLiveGpsActive ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}
                >
                  <MapPin className="w-4 h-4" />
                  <span>{isLiveGpsActive ? '실시간 GPS 추적 끄기' : '내 실제 위치로 지도 이동 및 GPS 켜기'}</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'setup' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
                <h2 className="text-sm font-bold">갤럭시 앱 설치 안내</h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  크롬 또는 삼성 인터넷 메뉴에서 <b>[홈 화면에 추가]</b>를 누르면 앱으로 설치됩니다.
                </p>
              </div>
            </div>
          )}
        </main>

        {/* 하단 탭 바 */}
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
