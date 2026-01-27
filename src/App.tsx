import { useEffect, useRef, useState } from 'react';
import * as ROSLIB from 'roslib';
import Joystick from './JoystickClean';
import auroraLogo from './assets/aurora.png';

interface SensorData {
  ros?: string;
  battery?: string;
  odom?: string;
  imu?: string;
  lastUpdate?: string;
}

interface BMEData {
  temp?: string;
  humidity?: string;
  pressure?: string;
  gas?: string;
  altitude?: string;
}

interface SoilData {
  ph?: string;
  moist?: string;
  k?: string;
  n?: string;
  p?: string;
  k2?: string;
}

function App() {
  const [webStatus, setWebStatus] = useState('Connecting...');
  const [webStatusColor, setWebStatusColor] = useState('#00ffcc');
  const [twistStatus, setTwistStatus] = useState('Pending...');
  const [twistStatusColor, setTwistStatusColor] = useState('#ccc');
  const [terminalOutput, setTerminalOutput] = useState('Initializing...');
  const [linearMul, setLinearMul] = useState(0.5);
  const [angularMul, setAngularMul] = useState(1.0);
  const [sensorData, setSensorData] = useState<SensorData>({});
  const [bmeData, setBmeData] = useState<BMEData>({});
  const [soilData, setSoilData] = useState<SoilData>({});
  const [streamNonce, setStreamNonce] = useState(() => Date.now());

  const cameraFeeds = [
    { title: 'Camera 1', topic: '/rishi/cam', compressed: false },
    { title: 'Camera 2', topic: '/rishi/cam', compressed: true },
    { title: 'Camera 3', topic: '/rishi/cam', compressed: true },
    { title: 'Camera 4', topic: '/rishi/cam', compressed: true },
  ];

  const rosRef = useRef<ROSLIB.Ros | null>(null);
  const cmdVelRef = useRef<ROSLIB.Topic<any> | null>(null);
  const gamepadIdxRef = useRef<number | null>(null);
  const joystickLogRef = useRef<{ t: number; lin: number; ang: number }>({ t: 0, lin: 0, ang: 0 });
  const terminalRef = useRef<HTMLTextAreaElement>(null);

  const logDebug = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setTerminalOutput((prev) => `${prev}\n[${ts}] ${msg}`);
    setTimeout(() => {
      if (terminalRef.current) {
        terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      }
    }, 0);
  };

  const updateStatus = (
    setter: (value: string) => void,
    colorSetter: (value: string) => void,
    text: string,
    color = '#00ffcc'
  ) => {
    setter(text);
    colorSetter(color);
  };

  const getROSTimestamp = () => {
    const now = Date.now();
    return {
      sec: Math.floor(now / 1000),
      nanosec: (now % 1000) * 1e6,
    };
  };

  const buildTwistStamped = (linX: number, angZ: number) => {
    return {
      header: {
        frame_id: 'base_link',
        stamp: getROSTimestamp(),
      },
      twist: {
        linear: { x: linX, y: 0.0, z: 0.0 },
        angular: { x: 0.0, y: 0.0, z: angZ },
      },
    };
  };

  const publishTwist = (lx: number, az: number) => {
    if (cmdVelRef.current) {
      cmdVelRef.current.publish(buildTwistStamped(lx, az));
    }
  };

  const handleJoystickMove = (linear: number, angular: number) => {
    publishTwist(linear, angular);
    // Throttle log output to ~100ms and only log meaningful changes
    const now = Date.now();
    const last = joystickLogRef.current;
    const linDelta = Math.abs(linear - last.lin);
    const angDelta = Math.abs(angular - last.ang);
    if (now - last.t > 100 || linDelta > 0.01 || angDelta > 0.01) {
      joystickLogRef.current = { t: now, lin: linear, ang: angular };
      logDebug(`🕹️ Joystick → lin ${linear.toFixed(2)}, ang ${angular.toFixed(2)}`);
    }
  };

  const handleJoystickEnd = () => {
    publishTwist(0, 0);
    logDebug('🛑 Joystick released – stop.');
  };

  const handleJoystickStatusUpdate = (text: string, color = '#00ffcc') => {
    updateStatus(setTwistStatus, setTwistStatusColor, text, color);
  };

  useEffect(() => {
    // Initialize ROS connection
    const ros = new ROSLIB.Ros({ url: 'ws://localhost:9090' });
    rosRef.current = ros;

    const ts = new Date().toLocaleTimeString();
    setTerminalOutput(`[${ts}] UI version: 2026-01-13\nInitializing...`);

    ros.on('connection', () => {
      updateStatus(setWebStatus, setWebStatusColor, 'Connected ✅');
      updateStatus(setTwistStatus, setTwistStatusColor, 'Idle ⚪', '#ccc');
      logDebug('✅ Connected to rosbridge.');
      setSensorData((prev) => ({ ...prev, ros: 'Connected', lastUpdate: new Date().toLocaleTimeString() }));
    });

    ros.on('error', (e: any) => {
      updateStatus(setWebStatus, setWebStatusColor, 'Error ❌', '#f55');
      updateStatus(setTwistStatus, setTwistStatusColor, 'Error ❌', '#f55');
      logDebug(`❌ ROS error: ${e}`);
      setSensorData((prev) => ({ ...prev, ros: 'Error', lastUpdate: new Date().toLocaleTimeString() }));
    });

    ros.on('close', () => {
      updateStatus(setWebStatus, setWebStatusColor, 'Disconnected ⚠️', '#fa0');
      updateStatus(setTwistStatus, setTwistStatusColor, 'Disconnected ⚠️', '#fa0');
      logDebug('⚠️ Disconnected from rosbridge.');
      setSensorData((prev) => ({ ...prev, ros: 'Disconnected', lastUpdate: new Date().toLocaleTimeString() }));
    });

    // Initialize cmd_vel publisher
    const cmdVel = new ROSLIB.Topic({
      ros,
      name: '/cmd_vel',
      messageType: 'geometry_msgs/msg/TwistStamped',
    });
    cmdVelRef.current = cmdVel;

    // Subscribe to soil sensor
    try {
      const soilTopic = new ROSLIB.Topic({
        ros,
        name: '/soil_sensor',
        messageType: 'std_msgs/msg/String',
      });
      soilTopic.subscribe((msg: any) => {
        try {
          const data = JSON.parse(msg.data);
          setSoilData({
            ph: data.ph !== undefined ? String(data.ph) : '—',
            moist: data.moist !== undefined ? `${data.moist}%` : '—',
            k: data.k !== undefined ? String(data.k) : '—',
            n: data.n !== undefined ? String(data.n) : '—',
            p: data.p !== undefined ? String(data.p) : '—',
            k2: data.k2 !== undefined ? String(data.k2) : '—',
          });
        } catch (e) {
          // ignore parse errors
        }
      });
    } catch (e) {
      // ignore
    }

    // Subscribe to BME680 sensor
    try {
      const bme680Topic = new ROSLIB.Topic({
        ros,
        name: '/bme680',
        messageType: 'std_msgs/msg/String',
      });
      bme680Topic.subscribe((msg: any) => {
        try {
          const arr = Array.isArray(msg?.data) ? msg.data : JSON.parse(msg.data);
          if (Array.isArray(arr)) {
            setBmeData({
              temp: arr[0] !== undefined ? `${arr[0].toFixed(2)} °C` : '—',
              humidity: arr[1] !== undefined ? `${arr[1].toFixed(2)} %` : '—',
              pressure: arr[2] !== undefined ? `${arr[2].toFixed(2)} hPa` : '—',
              gas: arr[3] !== undefined ? `${arr[3].toFixed(2)}` : '—',
              altitude: arr[4] !== undefined ? `${arr[4].toFixed(2)} m` : '—',
            });
          }
        } catch (e) {
          // ignore
        }
      });
    } catch (e) {
      // ignore
    }

    // Battery / Odom / IMU subscriptions removed per request

    // Gamepad support
    const handleGamepadConnected = (e: GamepadEvent) => {
      gamepadIdxRef.current = e.gamepad.index;
      logDebug(`🎮 Gamepad connected: ${e.gamepad.id}`);
      requestAnimationFrame(pollGamepad);
    };

    const handleGamepadDisconnected = () => {
      gamepadIdxRef.current = null;
      logDebug('🔌 Gamepad disconnected.');
    };

    const pollGamepad = () => {
      const gp = navigator.getGamepads()[gamepadIdxRef.current!];
      if (gp) {
        const x = gp.axes[0];
        const y = gp.axes[1];
        const deadzone = 0.1;
        const lin = Math.abs(y) > deadzone ? -y * linearMul : 0;
        const ang = Math.abs(x) > deadzone ? -x * angularMul : 0;

        publishTwist(lin, ang);
        if (lin || ang) {
          updateStatus(setTwistStatus, setTwistStatusColor, 'Active 🟢');
          logDebug(`🎮 Pad → lin ${lin.toFixed(2)}, ang ${ang.toFixed(2)}`);
        } else {
          updateStatus(setTwistStatus, setTwistStatusColor, 'Idle ⚪', '#ccc');
        }
      }
      if (gamepadIdxRef.current !== null) requestAnimationFrame(pollGamepad);
    };

    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

    return () => {
      ros.close();
      window.removeEventListener('gamepadconnected', handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
    };
  }, [linearMul, angularMul]);

  return (
    <div className="h-screen w-full bg-[#0b0b0d] text-slate-100 overflow-hidden flex flex-col">
      <div className="max-w-[1720px] mx-auto px-8 py-4 flex-1 flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between mb-4 border-b border-white/10 pb-4 shrink-0">
          <div className="flex items-center gap-4">
            <img src={auroraLogo} alt="Aurora" className="h-12" />
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Robotics Teleop Dashboard</div>
          </div>

          <div className="flex items-center gap-4">
            <div className="px-3 py-2 bg-white/5 rounded-full border border-white/10 flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${webStatusColor === '#00ffcc' ? 'bg-cyan-400 shadow' : 'bg-red-500'}`}></div>
              <div className="text-xs text-slate-300">{webStatus}</div>
            </div>
            <div className="px-3 py-2 bg-white/5 rounded-full border border-white/10 flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${twistStatusColor === '#00ffcc' ? 'bg-green-400 shadow' : 'bg-gray-500'}`}></div>
              <div className="text-xs text-slate-300">{twistStatus}</div>
            </div>
            <button onClick={() => setStreamNonce(Date.now())} className="px-3 py-2 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/20">Refresh streams</button>
          </div>
        </header>

        {/* Grid Layout: Left | Center | Right */}
        <div className="grid grid-cols-12 gap-4 flex-1 overflow-hidden">
          {/* Left column */}
          <aside className="col-span-3 space-y-2 flex flex-col overflow-hidden">
            <div className="p-4 rounded-xl bg-[#121318] border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.35)] shrink-0">
              <h4 className="heading-gradient text-base font-semibold mb-1">Robot Status</h4>
              <p className="text-sm text-slate-300">ROS: <span className="font-medium text-emerald-300">{sensorData.ros || '—'}</span></p>
              <p className="text-xs text-slate-400 mt-2">Last: {sensorData.lastUpdate || '—'}</p>
            </div>

            <div className="p-4 rounded-xl bg-[#121318] border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.35)] shrink-0">
              <h4 className="heading-gradient text-base font-semibold mb-1">Velocity Controls</h4>
              <div className="mb-3">
                <label className="text-xs text-slate-400">Linear</label>
                <div className="flex items-center gap-3">
                  <input type="range" min="0" max="2" step="0.1" value={linearMul} onChange={(e) => setLinearMul(parseFloat(e.target.value))} className="w-full accent-orange-400" />
                  <div className="text-sm text-orange-300 w-16 text-right">{linearMul.toFixed(1)}</div>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400">Angular</label>
                <div className="flex items-center gap-3">
                  <input type="range" min="0" max="3" step="0.1" value={angularMul} onChange={(e) => setAngularMul(parseFloat(e.target.value))} className="w-full accent-amber-300" />
                  <div className="text-sm text-amber-200 w-16 text-right">{angularMul.toFixed(1)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0f1014] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)] flex-1 overflow-hidden flex flex-col">
              <h4 className="heading-gradient text-base font-semibold mb-2 shrink-0">Terminal</h4>
              <textarea ref={terminalRef} readOnly value={terminalOutput} className="w-full flex-1 bg-black/70 text-emerald-300 font-mono text-xs p-2 rounded-md resize-none overflow-auto" />
            </div>
          </aside>

          {/* Main Cameras */}
          <main className="col-span-6 overflow-hidden">
            <div className="grid grid-cols-2 grid-rows-2 gap-3 h-full">
              {cameraFeeds.slice(0,4).map((cam, idx) => {
                const transport = cam.compressed ? 'ros_compressed' : 'mjpeg';
                const streamUrl = `http://localhost:8080/stream?topic=${cam.topic}&type=${transport}&t=${streamNonce}-cam${idx + 1}`;
                return (
                  <div key={cam.title} className="rounded-xl overflow-hidden border border-white/10 bg-[#0f1014] shadow-[0_8px_30px_rgba(0,0,0,0.35)] flex flex-col">
                    <div className="px-2 py-1 bg-black/30 border-b border-white/10 heading-gradient font-semibold text-sm shrink-0">{cam.title}</div>
                    <div className="flex-1 bg-black/70 flex items-center justify-center overflow-hidden">
                      <img src={streamUrl} alt={cam.title} className="w-full h-full object-cover" onError={(e)=>{(e.target as HTMLImageElement).style.opacity='0.2'; logDebug(`🚫 ${cam.title} stream fail (${cam.topic})`);}} />
                    </div>
                  </div>
                );
              })}
            </div>

          </main>

          {/* Right column */}
          <aside className="col-span-3 space-y-2 flex flex-col overflow-hidden">
            <div className="p-4 rounded-xl border border-white/10 bg-[#121318] shadow-[0_8px_30px_rgba(0,0,0,0.35)] shrink-0">
              <h4 className="heading-gradient text-base font-semibold mb-1">Soil Sensor</h4>
              <div className="grid grid-cols-2 gap-2 text-sm text-slate-300">
                <div>pH: {soilData.ph || '—'}</div>
                <div>Moist: {soilData.moist || '—'}</div>
                <div>N: {soilData.n || '—'}</div>
                <div>P: {soilData.p || '—'}</div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-white/10 bg-[#121318] shadow-[0_8px_30px_rgba(0,0,0,0.35)] shrink-0">
              <h4 className="heading-gradient text-base font-semibold mb-1">BME680</h4>
              <div className="text-sm text-slate-300">Temperature: {bmeData.temp || '—'}</div>
              <div className="text-sm text-slate-300">Humidity: {bmeData.humidity || '—'}</div>
              <div className="text-sm text-slate-300">Pressure: {bmeData.pressure || '—'}</div>
              <div className="text-sm text-slate-300">Gas: {bmeData.gas || '—'}</div>
              <div className="text-sm text-slate-300">Altitude: {bmeData.altitude || '—'}</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0f1014] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)] flex-1 flex flex-col">
              <h4 className="heading-gradient text-base font-semibold mb-2 shrink-0">Joystick</h4>
              <div className="w-full flex justify-center items-center flex-1">
                <div className="w-[200px]">
                  <Joystick
                    linearMul={linearMul}
                    angularMul={angularMul}
                    onMove={handleJoystickMove}
                    onEnd={handleJoystickEnd}
                    onStatusUpdate={handleJoystickStatusUpdate}
                  />
                </div>
              </div>
            </div>

          </aside>
        </div>
      </div>
    </div>
  );
}

export default App;
