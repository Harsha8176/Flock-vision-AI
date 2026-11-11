import React, { useState, useRef, useEffect } from "react";
import "./App.css";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState("Flock Operations Manager");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [activeTab, setActiveTab] = useState("recorded");
  const [isTheatreMode, setIsTheatreMode] = useState(false);
  const [isFullScreenModal, setIsFullScreenModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [fileType, setFileType] = useState("video");
  const [confidence, setConfidence] = useState(0.25);
  const [targetQuota, setTargetQuota] = useState(350);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Interactive Custom Gate Line State (Normalized 0.0 to 1.0 coordinates)
  const [gateLine, setGateLine] = useState({ x1: 0.12, y1: 0.65, x2: 0.88, y2: 0.65 });
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isMouseDragging, setIsMouseDragging] = useState(false);
  const mediaContainerRef = useRef(null);

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [webcamActive, setWebcamActive] = useState(false);

  // Poll live stats
  useEffect(() => {
    let pollTimer;
    if (sessionId && isAuthenticated) {
      pollTimer = setInterval(async () => {
        try {
          const res = await fetch(`http://127.0.0.1:8000/api/live-stats/${sessionId}`);
          if (res.ok) {
            const data = await res.json();
            setResult(data);
            if (data.is_finished) {
              clearInterval(pollTimer);
            }
          }
        } catch (err) {
          console.error("Error polling live stats:", err);
        }
      }, 350);
    }
    return () => clearInterval(pollTimer);
  }, [sessionId, isAuthenticated]);

  // Live webcam frame analysis
  useEffect(() => {
    let interval;
    if (activeTab === "webcam" && webcamActive && isAuthenticated) {
      interval = setInterval(async () => {
        if (webcamRef.current && canvasRef.current) {
          const video = webcamRef.current;
          const canvas = canvasRef.current;
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(async (blob) => {
            if (!blob) return;
            const formData = new FormData();
            formData.append("file", blob, "webcam_frame.jpg");
            formData.append("confidence", confidence);

            try {
              const response = await fetch("http://127.0.0.1:8000/api/count-sheep", {
                method: "POST",
                body: formData,
              });
              if (response.ok) {
                const data = await response.json();
                setResult(data);
              }
            } catch (err) {
              console.error("Live frame analysis error:", err);
            }
          }, "image/jpeg", 0.7);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeTab, webcamActive, confidence, isAuthenticated]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setIsFullScreenModal(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync updated gate coordinates with FastAPI backend live
  const syncGateLineToBackend = async (coords) => {
    setGateLine(coords);
    if (sessionId) {
      const formData = new FormData();
      formData.append("x1", coords.x1);
      formData.append("y1", coords.y1);
      formData.append("x2", coords.x2);
      formData.append("y2", coords.y2);
      try {
        await fetch(`http://127.0.0.1:8000/api/update-line/${sessionId}`, {
          method: "POST",
          body: formData,
        });
      } catch (err) {
        console.error("Failed to update custom gate line:", err);
      }
    }
  };

  // Mouse handlers for drawing custom gate line directly over the video
  const getNormalizedMousePos = (e) => {
    const rect = mediaContainerRef.current.getBoundingClientRect();
    const x = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0.02, Math.min(0.98, (e.clientY - rect.top) / rect.height));
    return { x: parseFloat(x.toFixed(3)), y: parseFloat(y.toFixed(3)) };
  };

  const handleMouseDown = (e) => {
    if (!isDrawingMode) return;
    const pos = getNormalizedMousePos(e);
    setIsMouseDragging(true);
    setGateLine({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
  };

  const handleMouseMove = (e) => {
    if (!isDrawingMode || !isMouseDragging) return;
    const pos = getNormalizedMousePos(e);
    setGateLine((prev) => ({ ...prev, x2: pos.x, y2: pos.y }));
  };

  const handleMouseUp = (e) => {
    if (!isDrawingMode || !isMouseDragging) return;
    const pos = getNormalizedMousePos(e);
    const updated = { ...gateLine, x2: pos.x, y2: pos.y };
    setIsMouseDragging(false);
    setIsDrawingMode(false);
    syncGateLineToBackend(updated);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (
      (username === "admin" && password === "flock123") ||
      (username === "operator" && password === "gate2026")
    ) {
      setUserRole(username === "admin" ? "Flock Operations Manager" : "Gate Telemetry Operator");
      setIsAuthenticated(true);
      setLoginError("");
    } else {
      setLoginError("Invalid credentials. Use the Quick Role Launchers below.");
    }
  };

  const handleQuickDemoLogin = (roleType) => {
    if (roleType === "manager") {
      setUsername("admin");
      setPassword("flock123");
      setUserRole("Flock Operations Manager");
    } else {
      setUsername("operator");
      setPassword("gate2026");
      setUserRole("Gate Telemetry Operator");
    }
    setLoginError("");
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    stopWebcam();
    setIsAuthenticated(false);
    setSessionId(null);
    setStreamUrl(null);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setStreamUrl(null);
      setSessionId(null);
      setFileType(file.type.startsWith("video") ? "video" : "image");
      setResult(null);
      setError(null);
      stopWebcam();
    }
  };

  const startWebcam = async () => {
    setActiveTab("webcam");
    setWebcamActive(true);
    setResult(null);
    setError(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setStreamUrl(null);
    setSessionId(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (webcamRef.current) {
        webcamRef.current.srcObject = stream;
      }
    } catch (err) {
      setError("Camera permission denied or camera unavailable.");
      setWebcamActive(false);
    }
  };

  const stopWebcam = () => {
    if (webcamRef.current && webcamRef.current.srcObject) {
      const stream = webcamRef.current.srcObject;
      stream.getTracks().forEach((track) => track.stop());
      webcamRef.current.srcObject = null;
    }
    setWebcamActive(false);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("confidence", confidence);
    formData.append("x1", gateLine.x1);
    formData.append("y1", gateLine.y1);
    formData.append("x2", gateLine.x2);
    formData.append("y2", gateLine.y2);

    try {
      if (fileType === "video") {
        const response = await fetch("http://127.0.0.1:8000/api/upload-video-stream", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error("Failed to initialize FlockVision video stream.");
        const data = await response.json();
        setStreamUrl(data.stream_url);
        setSessionId(data.session_id);
      } else {
        const response = await fetch("http://127.0.0.1:8000/api/count-sheep", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error("Sheep image detection failed.");
        const data = await response.json();
        if (data.annotated_image && activeTab === "recorded") {
          setPreviewUrl(data.annotated_image);
        }
        setResult(data);
      }
    } catch (err) {
      setError(err.message || "Connection error with FastAPI.");
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!result) return;
    let csv = "Telemetry Metric,Recorded Value\n";
    csv += `Audit Timestamp,${new Date().toLocaleString()}\n`;
    csv += `Verified By,${userRole}\n`;
    csv += `Net Verified Flock,${result.net_flock_count ?? 0}\n`;
    csv += `Forward Gate Entries,${result.gate_inbound ?? 0}\n`;
    csv += `Reverse Gate Exits,${result.reverse_exits ?? 0}\n`;
    csv += `Active Passage Occupancy,${result.active_in_zone ?? 0}\n`;
    csv += `Flow Speed (Sheep/Min),${result.throughput_per_min ?? 0}\n`;
    csv += `Passage Density Status,${result.flow_density ?? "SMOOTH FLOW"}\n`;
    csv += `Target Batch Quota,${targetQuota}\n\n`;

    if (result.entry_logs && result.entry_logs.length > 0) {
      csv += "Passage Order,Sheep Tag,Gate Event,Timestamp\n";
      result.entry_logs.forEach((log) => {
        csv += `#${log.order},${log.sheep_id},${log.event},${log.timestamp}\n`;
      });
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FlockVision_Gate_Report_${Date.now()}.csv`;
    a.click();
  };

  if (!isAuthenticated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "radial-gradient(circle at top right, #2e1505 0%, #0c0a09 65%, #050404 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Inter', system-ui, sans-serif",
          color: "#fafaf9",
          padding: "20px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "440px",
            background: "#1c1917",
            border: "1px solid #44403c",
            borderRadius: "18px",
            padding: "36px",
            boxShadow: "0 25px 60px rgba(0,0,0,0.85)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "10px" }}>
            <div
              style={{
                background: "linear-gradient(135deg, #f97316, #eab308)",
                color: "#0c0a09",
                fontWeight: "900",
                padding: "10px 12px",
                borderRadius: "12px",
                fontSize: "1.15rem",
                boxShadow: "0 4px 15px rgba(249, 115, 22, 0.35)",
              }}
            >
              FV
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.3rem", letterSpacing: "0.8px", color: "#fb923c" }}>
                FLOCKVISION AI
              </h2>
              <span style={{ fontSize: "0.76rem", color: "#a8a29e" }}>
                Autonomous Sheep Gate & Flow Telemetry Platform
              </span>
            </div>
          </div>

          <form onSubmit={handleLogin} style={{ marginTop: "26px" }}>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "#a8a29e", marginBottom: "6px" }}>
                OPERATOR ID
              </label>
              <input
                type="text"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "11px 14px",
                  background: "#0c0a09",
                  border: "1px solid #44403c",
                  borderRadius: "10px",
                  color: "#fafaf9",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "#a8a29e", marginBottom: "6px" }}>
                SECURITY KEY
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "11px 14px",
                  background: "#0c0a09",
                  border: "1px solid #44403c",
                  borderRadius: "10px",
                  color: "#fafaf9",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            {loginError && (
              <div
                style={{
                  background: "rgba(244, 63, 94, 0.15)",
                  border: "1px solid #f43f5e",
                  color: "#fda4af",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  fontSize: "0.78rem",
                  marginBottom: "16px",
                }}
              >
                {loginError}
              </div>
            )}

            <button
              type="submit"
              style={{
                width: "100%",
                padding: "13px",
                background: "linear-gradient(90deg, #ea580c, #eab308)",
                color: "#0c0a09",
                border: "none",
                borderRadius: "10px",
                fontWeight: "800",
                fontSize: "0.95rem",
                cursor: "pointer",
              }}
            >
              🔓 Enter Flock Command Center
            </button>
          </form>

          <div
            style={{
              marginTop: "24px",
              paddingTop: "18px",
              borderTop: "1px solid #292524",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: "0.72rem", color: "#78716c", display: "block", marginBottom: "10px" }}>
              ONE-CLICK PRESENTATION PROFILES
            </span>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => handleQuickDemoLogin("manager")}
                style={{
                  flex: 1,
                  padding: "9px",
                  background: "#292524",
                  color: "#fb923c",
                  border: "1px solid #44403c",
                  borderRadius: "8px",
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  fontWeight: "600",
                }}
              >
                ⚡ Flock Manager
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemoLogin("operator")}
                style={{
                  flex: 1,
                  padding: "9px",
                  background: "#292524",
                  color: "#facc15",
                  border: "1px solid #44403c",
                  borderRadius: "8px",
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  fontWeight: "600",
                }}
              >
                ⚡ Gate Operator
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeInZone = result?.active_in_zone ?? 0;
  const gateInbound = result?.gate_inbound ?? 0;
  const reverseExits = result?.reverse_exits ?? 0;
  const netFlockCount = result?.net_flock_count ?? 0;
  const throughputRate = result?.throughput_per_min ?? 0.0;
  const flowDensity = result?.flow_density ?? "SMOOTH FLOW";
  const quotaPct = Math.min(100, Math.round((netFlockCount / (targetQuota || 1)) * 100));
  const totalMovements = Math.max(1, gateInbound + reverseExits);
  const inboundRatioPct = Math.round((gateInbound / totalMovements) * 100);
  const activeBlocks = Math.round((quotaPct / 100) * 16);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0c0a09",
        color: "#f5f5f4",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "18px 24px",
        boxSizing: "border-box",
      }}
    >
      {/* TOP NAVIGATION BAR */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#1c1917",
          border: "1px solid #292524",
          borderRadius: "14px",
          padding: "14px 22px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              background: "linear-gradient(135deg, #f97316, #eab308)",
              color: "#0c0a09",
              fontWeight: "900",
              padding: "8px 11px",
              borderRadius: "10px",
              fontSize: "1.05rem",
            }}
          >
            FV
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.15rem", color: "#fb923c", letterSpacing: "0.6px" }}>
              FLOCKVISION AI — INTERACTIVE GATE & FLOW ANALYTICS
            </h1>
            <p style={{ margin: "2px 0 0 0", fontSize: "0.74rem", color: "#a8a29e" }}>
              YOLOv11s Single-Class Engine • Custom Drawable 2D Tripwire (Horizontal / Vertical / Angled)
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span
            style={{
              background: "#292524",
              border: "1px solid #44403c",
              color: "#fdba74",
              padding: "6px 12px",
              borderRadius: "999px",
              fontSize: "0.75rem",
              fontWeight: "600",
            }}
          >
            ✦ {userRole}
          </span>

          {result && (
            <button
              onClick={exportCSV}
              style={{
                background: "linear-gradient(90deg, #ea580c, #d97706)",
                color: "#fff",
                border: "none",
                padding: "7px 14px",
                borderRadius: "999px",
                fontSize: "0.78rem",
                cursor: "pointer",
                fontWeight: "700",
              }}
            >
              📥 Export Gate Report CSV
            </button>
          )}

          <button
            onClick={handleLogout}
            style={{
              background: "transparent",
              color: "#a8a29e",
              border: "1px solid #44403c",
              padding: "6px 12px",
              borderRadius: "999px",
              fontSize: "0.75rem",
              cursor: "pointer",
            }}
          >
            Exit
          </button>
        </div>
      </header>

      {/* COMMAND TOOLBAR */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#1c1917",
          border: "1px solid #292524",
          borderRadius: "12px",
          padding: "10px 18px",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              setActiveTab("recorded");
              stopWebcam();
            }}
            style={{
              background: activeTab === "recorded" ? "#ea580c" : "#292524",
              color: activeTab === "recorded" ? "#fff" : "#d6d3d1",
              border: "1px solid #44403c",
              padding: "8px 14px",
              borderRadius: "8px",
              fontSize: "0.8rem",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            📁 Gate Video / Image
          </button>

          <button
            onClick={startWebcam}
            style={{
              background: activeTab === "webcam" ? "#ea580c" : "#292524",
              color: activeTab === "webcam" ? "#fff" : "#d6d3d1",
              border: "1px solid #44403c",
              padding: "8px 14px",
              borderRadius: "8px",
              fontSize: "0.8rem",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            📹 Live Camera Stream
          </button>

          {activeTab === "recorded" && (
            <label
              style={{
                background: "#292524",
                color: "#fbbf24",
                border: "1px dashed #f59e0b",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "0.8rem",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              + Load Sheep Media
              <input type="file" accept="image/*,video/*" onChange={handleFileChange} hidden />
            </label>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => setIsTheatreMode(!isTheatreMode)}
            style={{
              background: isTheatreMode ? "#f59e0b" : "#292524",
              color: isTheatreMode ? "#0c0a09" : "#fde68a",
              border: "1px solid #78350f",
              padding: "7px 13px",
              borderRadius: "8px",
              fontSize: "0.78rem",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            {isTheatreMode ? "◧ Restore Split Sidebar" : "🖥️ Expand Full-Width View"}
          </button>

          <button
            onClick={() => setIsFullScreenModal(true)}
            disabled={!previewUrl && !streamUrl && !webcamActive}
            style={{
              background: "#292524",
              color: "#fb923c",
              border: "1px solid #44403c",
              padding: "7px 13px",
              borderRadius: "8px",
              fontSize: "0.78rem",
              fontWeight: "700",
              cursor: previewUrl || streamUrl || webcamActive ? "pointer" : "not-allowed",
              opacity: previewUrl || streamUrl || webcamActive ? 1 : 0.5,
            }}
          >
            ⛶ Cinema Fullscreen
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "#a8a29e" }}>
            <span>Target Flock:</span>
            <input
              type="number"
              min="1"
              max="5000"
              value={targetQuota}
              onChange={(e) => setTargetQuota(Math.max(1, parseInt(e.target.value) || 1))}
              style={{
                width: "68px",
                background: "#0c0a09",
                color: "#fb923c",
                border: "1px solid #44403c",
                borderRadius: "8px",
                padding: "5px 8px",
                fontWeight: "bold",
              }}
            />
          </div>
        </div>
      </div>

      {/* MAIN WORKSPACE */}
      <main
        style={{
          display: "grid",
          gridTemplateColumns: isTheatreMode ? "1fr" : "1.55fr 1fr",
          gap: "18px",
          alignItems: "start",
        }}
      >
        {/* LEFT: VIDEO / IMAGE VIEWPORT WITH INTERACTIVE DRAWING OVERLAY */}
        <section
          style={{
            background: "#1c1917",
            border: "1px solid #292524",
            borderRadius: "16px",
            padding: "16px",
          }}
        >
          {/* INTERACTIVE GATE DRAWING TOOLBAR */}
          {activeTab === "recorded" && fileType === "video" && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#0c0a09",
                border: `1px solid ${isDrawingMode ? "#22c55e" : "#292524"}`,
                borderRadius: "10px",
                padding: "8px 12px",
                marginBottom: "12px",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  onClick={() => setIsDrawingMode(!isDrawingMode)}
                  style={{
                    background: isDrawingMode ? "#22c55e" : "#ea580c",
                    color: "#0c0a09",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.76rem",
                    fontWeight: "800",
                    cursor: "pointer",
                  }}
                >
                  {isDrawingMode ? "✨ Click & Drag on Video Now..." : "✏️ Draw Custom Gate on Video"}
                </button>

                <button
                  onClick={() => syncGateLineToBackend({ x1: 0.12, y1: 0.65, x2: 0.88, y2: 0.65 })}
                  style={{
                    background: "#292524",
                    color: "#fde047",
                    border: "1px solid #44403c",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    fontSize: "0.74rem",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  ━ Horizontal Gate
                </button>

                <button
                  onClick={() => syncGateLineToBackend({ x1: 0.50, y1: 0.12, x2: 0.50, y2: 0.88 })}
                  style={{
                    background: "#292524",
                    color: "#38bdf8",
                    border: "1px solid #44403c",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    fontSize: "0.74rem",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  ┃ Vertical Gate
                </button>

                <button
                  onClick={() =>
                    syncGateLineToBackend({
                      x1: gateLine.x2,
                      y1: gateLine.y2,
                      x2: gateLine.x1,
                      y2: gateLine.y1,
                    })
                  }
                  style={{
                    background: "#292524",
                    color: "#fda4af",
                    border: "1px solid #44403c",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    fontSize: "0.74rem",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                  title="Swap Forward Entry vs Reverse Exit direction"
                >
                  ⇄ Flip Entry Direction
                </button>
              </div>

              <span style={{ fontSize: "0.72rem", color: isDrawingMode ? "#4ade80" : "#a8a29e" }}>
                {isDrawingMode
                  ? "Drag mouse from Point A to Point B on video"
                  : `FLOW: ${flowDensity}`}
              </span>
            </div>
          )}

          {/* Media Canvas with Interactive SVG Drawing Layer */}
          <div
            ref={mediaContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{
              position: "relative",
              background: "#090807",
              borderRadius: "12px",
              border: `2px solid ${isDrawingMode ? "#22c55e" : "#292524"}`,
              height: isTheatreMode ? "70vh" : "460px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              cursor: isDrawingMode ? "crosshair" : "default",
              userSelect: "none",
            }}
          >
            {activeTab === "recorded" ? (
              !previewUrl ? (
                <div style={{ textAlign: "center", color: "#78716c" }}>
                  <div style={{ fontSize: "2.2rem", marginBottom: "8px" }}>🐑</div>
                  <p style={{ margin: 0, fontSize: "0.9rem" }}>
                    Click <strong>+ Load Sheep Media</strong> to preview video & draw your custom gate line
                  </p>
                </div>
              ) : streamUrl ? (
                <img
                  src={streamUrl}
                  alt="FlockVision Live Stream"
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "fill" }}
                />
              ) : fileType === "image" ? (
                <img
                  src={previewUrl}
                  alt="Uploaded preview"
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <video
                  src={previewUrl}
                  controls={!isDrawingMode}
                  style={{ width: "100%", height: "100%", objectFit: "fill" }}
                />
              )
            ) : (
              <div style={{ position: "relative", width: "100%", height: "100%" }}>
                <video
                  ref={webcamRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
                <canvas ref={canvasRef} style={{ display: "none" }} />
              </div>
            )}

            {/* Interactive SVG Overlay Previewing User's Drawn Gate Line */}
            {previewUrl && fileType === "video" && (!streamUrl || isDrawingMode || isMouseDragging) && (
              <svg
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              >
                <line
                  x1={`${gateLine.x1 * 100}%`}
                  y1={`${gateLine.y1 * 100}%`}
                  x2={`${gateLine.x2 * 100}%`}
                  y2={`${gateLine.y2 * 100}%`}
                  stroke="#22c55e"
                  strokeWidth="4"
                  strokeDasharray={isMouseDragging ? "6,6" : "none"}
                />
                <circle cx={`${gateLine.x1 * 100}%`} cy={`${gateLine.y1 * 100}%`} r="7" fill="#f97316" />
                <circle cx={`${gateLine.x2 * 100}%`} cy={`${gateLine.y2 * 100}%`} r="7" fill="#eab308" />
              </svg>
            )}
          </div>

          {/* Sliders & Execution Button */}
          {activeTab === "recorded" && (
            <div style={{ marginTop: "14px" }}>
              <div style={{ background: "#0c0a09", padding: "10px 14px", borderRadius: "10px", border: "1px solid #292524", marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "#a8a29e", marginBottom: "4px" }}>
                  <span>AI Detection Confidence Sensitivity</span>
                  <strong style={{ color: "#fb923c" }}>{Math.round(confidence * 100)}%</strong>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.90"
                  step="0.05"
                  value={confidence}
                  onChange={(e) => setConfidence(parseFloat(e.target.value))}
                  style={{ width: "100%", accentColor: "#f97316" }}
                />
              </div>

              <button
                onClick={handleAnalyze}
                disabled={!selectedFile || loading}
                style={{
                  width: "100%",
                  padding: "13px",
                  fontSize: "0.95rem",
                  fontWeight: "800",
                  background: !selectedFile
                    ? "#292524"
                    : "linear-gradient(90deg, #ea580c 0%, #f59e0b 100%)",
                  color: !selectedFile ? "#78716c" : "#0c0a09",
                  border: "none",
                  borderRadius: "10px",
                  cursor: !selectedFile ? "not-allowed" : "pointer",
                }}
              >
                {loading
                  ? "Starting FlockVision Stream..."
                  : `⚡ Execute Live ${fileType === "video" ? "Custom Gate Video Stream" : "High-Res Flock Scan"}`}
              </button>
            </div>
          )}

          {error && <div style={{ color: "#fda4af", fontSize: "0.85rem", marginTop: "10px" }}>{error}</div>}
        </section>

        {/* RIGHT SIDEBAR */}
        {!isTheatreMode && (
          <aside style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div
              style={{
                background: "linear-gradient(145deg, #27170a 0%, #1c1917 100%)",
                border: "1px solid #9a3412",
                borderRadius: "16px",
                padding: "18px 20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: "700", color: "#fdba74" }}>
                  NET VERIFIED FLOCK COUNT
                </span>
                <span
                  style={{
                    background: "#431407",
                    color: "#fb923c",
                    border: "1px solid #ea580c",
                    padding: "2px 9px",
                    borderRadius: "999px",
                    fontSize: "0.72rem",
                    fontWeight: "700",
                  }}
                >
                  {quotaPct}% OF TARGET
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "10px 0" }}>
                <div style={{ fontSize: "2.5rem", fontWeight: "900", color: "#fafaf9", lineHeight: 1 }}>
                  {netFlockCount}
                </div>
                <div style={{ fontSize: "0.82rem", color: "#a8a29e" }}>
                  Target Flock: <strong style={{ color: "#fde047" }}>{targetQuota}</strong> sheep
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(16, 1fr)", gap: "4px", marginTop: "10px" }}>
                {Array.from({ length: 16 }).map((_, idx) => (
                  <div
                    key={idx}
                    style={{
                      height: "9px",
                      borderRadius: "3px",
                      background: idx < activeBlocks ? "linear-gradient(180deg, #fb923c, #ea580c)" : "#292524",
                    }}
                  />
                ))}
              </div>
            </div>

            <div
              style={{
                background: "#1c1917",
                border: "1px solid #292524",
                borderRadius: "16px",
                padding: "16px 18px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#a8a29e", marginBottom: "8px", fontWeight: "700" }}>
                <span style={{ color: "#4ade80" }}>▲ FORWARD GATE ENTRY</span>
                <span style={{ color: "#fb7185" }}>▼ REVERSE GATE EXIT</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "1.75rem", fontWeight: "800", color: "#4ade80" }}>
                  +{gateInbound}
                </span>
                <span
                  style={{
                    fontSize: "0.72rem",
                    background: "#292524",
                    color: "#d6d3d1",
                    padding: "3px 10px",
                    borderRadius: "999px",
                  }}
                >
                  {inboundRatioPct}% Forward Flow
                </span>
                <span style={{ fontSize: "1.75rem", fontWeight: "800", color: "#fb7185" }}>
                  -{reverseExits}
                </span>
              </div>

              <div
                style={{
                  width: "100%",
                  height: "10px",
                  background: "#fb7185",
                  borderRadius: "999px",
                  overflow: "hidden",
                  display: "flex",
                }}
              >
                <div
                  style={{
                    width: `${inboundRatioPct}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #22c55e, #4ade80)",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div
                style={{
                  background: "#1c1917",
                  border: "1px solid #292524",
                  borderLeft: "5px solid #f97316",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: "700", color: "#a8a29e" }}>
                    ACTIVE IN PASSAGE ZONE
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#78716c" }}>
                    real-time sheep currently in camera frame
                  </div>
                </div>
                <span style={{ fontSize: "1.65rem", fontWeight: "900", color: "#fb923c" }}>
                  {activeInZone}
                </span>
              </div>

              <div
                style={{
                  background: "#1c1917",
                  border: "1px solid #292524",
                  borderLeft: "5px solid #eab308",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: "700", color: "#a8a29e" }}>
                    GATE FLOW SPEED
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#78716c" }}>
                    verified sheep crossings per minute
                  </div>
                </div>
                <span style={{ fontSize: "1.55rem", fontWeight: "900", color: "#fde047" }}>
                  {throughputRate} <small style={{ fontSize: "0.75rem", color: "#a8a29e" }}>/min</small>
                </span>
              </div>
            </div>

            <div
              style={{
                background: "#1c1917",
                border: "1px solid #292524",
                borderRadius: "16px",
                padding: "16px 18px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: "700", color: "#fdba74" }}>
                  LIVE SENSOR GATE TIMELINE
                </span>
                <span style={{ fontSize: "0.68rem", color: "#78716c", fontFamily: "monospace" }}>
                  {result?.is_finished
                    ? "✓ STREAM COMPLETE"
                    : sessionId
                    ? `FRAME #${result?.total_frames_processed ?? 0}`
                    : "READY"}
                </span>
              </div>

              <div style={{ maxHeight: "145px", overflowY: "auto", paddingLeft: "6px" }}>
                {result?.entry_logs && result.entry_logs.length > 0 ? (
                  result.entry_logs.map((item) => {
                    const isForward = item.event.includes("ENTRY");
                    return (
                      <div
                        key={item.order}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderLeft: `2px solid ${isForward ? "#4ade80" : "#fb7185"}`,
                          paddingLeft: "12px",
                          paddingBottom: "8px",
                          position: "relative",
                          fontSize: "0.75rem",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            left: "-5px",
                            top: "4px",
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: isForward ? "#4ade80" : "#fb7185",
                          }}
                        />
                        <div>
                          <strong style={{ color: "#fafaf9" }}>{item.sheep_id}</strong>{" "}
                          <span
                            style={{
                              fontSize: "0.68rem",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              marginLeft: "4px",
                              background: isForward ? "rgba(74,222,128,0.15)" : "rgba(251,113,133,0.15)",
                              color: isForward ? "#4ade80" : "#fb7185",
                            }}
                          >
                            {item.event}
                          </span>
                        </div>
                        <span style={{ fontFamily: "monospace", color: "#fbbf24", fontSize: "0.72rem" }}>
                          {item.timestamp}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ color: "#78716c", fontSize: "0.76rem", padding: "12px 0" }}>
                    Draw or select a gate line and start the stream...
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}
      </main>

      {/* FULLSCREEN CINEMA MODAL */}
      {isFullScreenModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(9, 8, 7, 0.96)",
            backdropFilter: "blur(10px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "20px 30px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#fb923c", fontSize: "1rem", fontWeight: "800" }}>
              FLOCKVISION AI • FULL-VIEW INSPECTION
            </span>
            <button
              onClick={() => setIsFullScreenModal(false)}
              style={{
                background: "#292524",
                color: "#fda4af",
                border: "1px solid #f43f5e",
                padding: "8px 18px",
                borderRadius: "999px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              ✕ Close Full View (ESC)
            </button>
          </div>

          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", margin: "14px 0" }}>
            {streamUrl ? (
              <img src={streamUrl} alt="Fullscreen Live Stream" style={{ maxWidth: "96vw", maxHeight: "78vh", objectFit: "contain", borderRadius: "12px" }} />
            ) : previewUrl ? (
              <img src={previewUrl} alt="Fullscreen Scan" style={{ maxWidth: "96vw", maxHeight: "78vh", objectFit: "contain", borderRadius: "12px" }} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;