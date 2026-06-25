import { useState, useEffect } from "react";
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";

function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState("LOW");
  const [dueDate, setDueDate] = useState("");
  const [user, setUser] = useState(null);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    email: "",
    password: ""
  });

  // Dark Mode & UI state
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("theme") === "dark" || 
      (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });
  const [toast, setToast] = useState(null);
  const [loadingStates, setLoadingStates] = useState({});
  const [expandedPanels, setExpandedPanels] = useState({}); // { [taskId]: 'SOLUTION' | 'SUMMARY' | 'QUIZ' | null }

  // Apply Theme
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    const endpoint = isSigningUp ? "register" : "login";
    
    try {
      const response = await fetch(`http://localhost:8000/api/${endpoint}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.status === "success") {
        if (!isSigningUp) {
          setUser(data.user); 
          showToast("Welcome back! Successfully logged in.");
        } else {
          showToast("Account created! Please sign in.");
          setIsSigningUp(false);
        }
      } else {
        showToast(data.message || "Authentication failed", "error");
      }
    } catch (error) {
      console.error("Connection Error:", error);
      showToast("Server connection error. Please try again.", "error");
    }
  };
  
  const handleLoginSuccess = (credentialResponse) => {
    const decoded = jwtDecode(credentialResponse.credential);
    setUser({
      name: decoded.name || decoded.email,
      email: decoded.email
    }); 
    showToast("Google Login successful!");
  };

  useEffect(() => {
    if (user) {
      fetch("http://localhost:8000/api/tasks/")
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch tasks");
          return res.json();
        })
        .then(data => {
          setTasks(data);
        })
        .catch(err => {
          console.error("ERROR:", err);
          showToast("Failed to retrieve tasks", "error");
        });
    }
  }, [user]);

  const handleAddTask = () => {
    if (!title.strip && !title) {
      showToast("Task title is required", "error");
      return;
    }
    fetch("http://localhost:8000/api/tasks/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        title,
        subject,
        priority,
        due_date: dueDate || new Date().toISOString().split('T')[0],
      }),
    })
      .then(res => res.json())
      .then(newTask => {
        setTasks([newTask, ...tasks]);
        setTitle("");
        setSubject("");
        setDueDate("");
        showToast("Task added successfully!");
      })
      .catch(err => {
        console.error(err);
        showToast("Error creating task", "error");
      });
  };
  
  const handleToggleStatus = (id) => {
    fetch(`http://localhost:8000/toggle_status/${id}/`, {
      method: "POST", 
    })
      .then(res => res.json())
      .then(data => {
        setTasks(tasks.map(task => 
          task.id === id ? { ...task, status: data.status } : task
        ));
        showToast(`Task status set to ${data.status.toLowerCase()}`);
      })
      .catch(err => {
        console.error("Error toggling status:", err);
        showToast("Failed to toggle task status", "error");
      });
  };

  const handleDeleteTask = (id) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;

    fetch(`http://localhost:8000/delete_task/${id}/`, {
      method: "POST",
    })
      .then(() => {
        setTasks(tasks.filter((task) => task.id !== id));
        showToast("Task deleted.");
      })
      .catch((err) => {
        console.error("Error deleting task:", err);
        showToast("Failed to delete task", "error");
      });
  };

  // Upload Assignment File
  const handleFileUpload = async (taskId, file) => {
    if (!file) return;
    const allowedExtensions = ["pdf", "docx", "jpg", "png", "jpeg"];
    const ext = file.name.split(".").pop().toLowerCase();
    
    if (!allowedExtensions.includes(ext)) {
      showToast("Unsupported file type! Allowed: PDF, DOCX, JPG, PNG", "error");
      return;
    }

    setLoadingStates(prev => ({ ...prev, [`${taskId}_upload`]: true }));
    const fData = new FormData();
    fData.append("file", file);

    try {
      const response = await fetch(`http://localhost:8000/api/tasks/${taskId}/upload/`, {
        method: "POST",
        body: fData,
      });

      const data = await response.json();
      if (response.ok) {
        showToast("Assignment file uploaded successfully!");
        setTasks(prev => prev.map(t => {
          if (t.id === taskId) {
            return { ...t, files: [...(t.files || []), data] };
          }
          return t;
        }));
      } else {
        showToast(data.error || "Failed to upload file", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Connection error while uploading file", "error");
    } finally {
      setLoadingStates(prev => ({ ...prev, [`${taskId}_upload`]: false }));
    }
  };

  // Generate AI Response (Solution, Summary, Quiz)
  const handleGenerateAI = async (taskId, type) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.files || task.files.length === 0) {
      showToast("Please upload an assignment file first!", "error");
      return;
    }

    setLoadingStates(prev => ({ ...prev, [`${taskId}_${type}`]: true }));
    
    try {
      const endpoint = type === 'SOLUTION' ? 'generate-solution' : 
                       type === 'SUMMARY' ? 'generate-summary' : 'generate-quiz';
      
      const response = await fetch(`http://localhost:8000/api/tasks/${taskId}/${endpoint}/`, {
        method: "POST"
      });
      
      const data = await response.json();
      
      if (response.ok) {
        showToast(`${type.replace("_", " ")} generated successfully!`);
        setTasks(prev => prev.map(t => {
          if (t.id === taskId) {
            return {
              ...t,
              ai_responses: {
                ...(t.ai_responses || {}),
                [type]: data
              }
            };
          }
          return t;
        }));
        setExpandedPanels(prev => ({ ...prev, [taskId]: type }));
      } else {
        showToast(data.error || "AI generation failed", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Connection error during AI generation", "error");
    } finally {
      setLoadingStates(prev => ({ ...prev, [`${taskId}_${type}`]: false }));
    }
  };

  // Parse AI Response Q&A text structure
  const parseAIResponse = (text) => {
    if (!text) return [];
    const parts = text.split(/Question \d+:/i);
    const questions = [];
    
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const answerSplit = part.split(/Answer:/i);
      const questionText = answerSplit[0]?.trim() || "";
      
      let answerText = "";
      let explanationText = "";
      
      if (answerSplit[1]) {
        const explanationSplit = answerSplit[1].split(/Explanation:/i);
        answerText = explanationSplit[0]?.trim() || "";
        explanationText = explanationSplit[1]?.trim() || "";
      }
      
      questions.push({
        number: i,
        question: questionText,
        answer: answerText,
        explanation: explanationText
      });
    }
    return questions;
  };

  const renderResponseContent = (text, type) => {
    if (type === 'SOLUTION') {
      const questions = parseAIResponse(text);
      if (questions.length > 0) {
        return (
          <div className="space-y-4">
            {questions.map((q) => (
              <div key={q.number} className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50 shadow-sm">
                <h4 className="font-semibold text-slate-800 dark:text-slate-100 flex gap-2">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">Q{q.number}:</span>
                  {q.question}
                </h4>
                <div className="mt-3 pl-3 border-l-2 border-indigo-500">
                  <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Answer</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{q.answer}</p>
                </div>
                {q.explanation && (
                  <div className="mt-3 pl-3 border-l-2 border-emerald-500">
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Step-by-Step Explanation</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 whitespace-pre-line leading-relaxed">{q.explanation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      }
    }

    return (
      <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-5 rounded-xl border border-slate-100 dark:border-slate-800/50 shadow-inner">
        {text}
      </div>
    );
  };

  // Dynamic Statistics
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === "COMPLETED").length;
  const pendingTasks = tasks.filter(t => t.status === "PENDING").length;
  const totalFiles = tasks.reduce((sum, t) => sum + (t.files?.length || 0), 0);
  const totalAIResponses = tasks.reduce((sum, t) => sum + (t.ai_responses ? Object.keys(t.ai_responses).length : 0), 0);
  const studyHoursSaved = (totalAIResponses * 1.5 + totalFiles * 0.5).toFixed(1);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-4 transition-colors duration-300">
        {/* Toast element */}
        {toast && (
          <div className={`fixed top-5 right-5 z-50 flex items-center p-4 rounded-2xl shadow-xl border transition-all duration-300 ${
            toast.type === 'error' 
              ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300' 
              : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
          }`}>
            <p className="font-medium text-sm">{toast.message}</p>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 p-8 md:p-10 rounded-3xl shadow-xl w-full max-w-md border border-slate-200/60 dark:border-slate-800/80 transition-colors">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/20 font-bold text-2xl">
              🎓
            </div>
            <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
              {isSigningUp ? "Create Account" : "Welcome Back"}
            </h1>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
              AI-Powered Student Task Manager
            </p>
          </div>
          
          <form className="space-y-4 mb-6" onSubmit={handleAuth}>
            {isSigningUp && (
              <>
                <input 
                  name="fullName" type="text" placeholder="Full Name" required
                  className="w-full p-3 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-200 transition-all text-sm" 
                  onChange={handleChange} 
                />
                <input 
                  name="email" type="email" placeholder="Email Address" required
                  className="w-full p-3 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-200 transition-all text-sm" 
                  onChange={handleChange} 
                />
              </>
            )}

            <input 
              name="username" type="text" placeholder="Username" required
              className="w-full p-3 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-200 transition-all text-sm" 
              onChange={handleChange} 
            />

            <input 
              name="password" type="password" placeholder="Password" required
              className="w-full p-3 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-200 transition-all text-sm" 
              onChange={handleChange} 
            />
            
            <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition duration-255 shadow-lg shadow-indigo-500/20 text-sm">
              {isSigningUp ? "Sign Up" : "Sign In"}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-6">
            {isSigningUp ? "Already have an account?" : "New to the platform?"} 
            <button onClick={() => setIsSigningUp(!isSigningUp)} className="text-indigo-600 dark:text-indigo-400 font-bold ml-1 hover:underline">
              {isSigningUp ? "Login" : "Create one"}
            </button>
          </p>

          <div className="relative flex items-center mb-6">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-850"></div>
            <span className="flex-shrink mx-4 text-slate-400 dark:text-slate-500 text-xs uppercase font-semibold">Or</span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-850"></div>
          </div>

          <div className="flex justify-center">
            <GoogleLogin onSuccess={handleLoginSuccess} onError={() => showToast("Google Login Failed", "error")} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-55 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300 p-4 md:p-8">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center p-4 rounded-2xl shadow-2xl border transition-all duration-300 transform scale-100 ${
          toast.type === 'error' 
            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300' 
            : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
        }`}>
          <div className="mr-3">
            {toast.type === 'error' ? (
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <p className="font-semibold text-sm">{toast.message}</p>
        </div>
      )}

      {/* Header Container */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 via-indigo-550 to-purple-600 dark:from-indigo-400 dark:via-indigo-350 dark:to-purple-400 bg-clip-text text-transparent">
            Task Dashboard
          </h1>
          <p className="text-slate-400 dark:text-slate-400 mt-1 text-sm md:text-base">
            Manage your assignments and unlock deep learning insights <span className="font-bold text-indigo-500 dark:text-indigo-400"></span>.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Dark Mode Switcher */}
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-850 transition duration-200"
            title="Toggle Theme"
          >
            {darkMode ? "☀️" : "🌙"}
          </button>

          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 px-4 py-2 border border-slate-200/60 dark:border-slate-800 rounded-xl flex-grow md:flex-grow-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs text-slate-400 dark:text-slate-500">Student</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{user.name}</p>
            </div>
          </div>

          <button 
            onClick={() => {
              setUser(null);
              showToast("Successfully logged out.");
            }} 
            className="bg-red-50 dark:bg-red-950/20 text-red-650 dark:text-red-400 px-4 py-2.5 rounded-xl hover:bg-red-100 dark:hover:bg-red-950/40 transition duration-200 font-medium border border-red-150/40 dark:border-red-900/35 text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Analytics Dashboard Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-850 shadow-sm hover:-translate-y-1 transition-all duration-300">
          <h2 className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider">Total Tasks</h2>
          <p className="text-3xl font-black mt-2 text-slate-800 dark:text-slate-100">{totalTasks}</p>
        </div>

        <div className="bg-emerald-50/50 dark:bg-emerald-950/10 p-5 rounded-2xl border border-emerald-100/70 dark:border-emerald-950/30 shadow-sm hover:-translate-y-1 transition-all duration-300 text-emerald-700 dark:text-emerald-450">
          <h2 className="text-xs font-bold uppercase tracking-wider">Completed</h2>
          <p className="text-3xl font-black mt-2 text-slate-850 dark:text-emerald-400">{completedTasks}</p>
        </div>

        <div className="bg-amber-50/50 dark:bg-amber-950/10 p-5 rounded-2xl border border-amber-100/70 dark:border-amber-950/30 shadow-sm hover:-translate-y-1 transition-all duration-300 text-amber-700 dark:text-amber-450">
          <h2 className="text-xs font-bold uppercase tracking-wider">Pending</h2>
          <p className="text-3xl font-black mt-2 text-slate-850 dark:text-amber-400">{pendingTasks}</p>
        </div>

        <div className="bg-purple-50/50 dark:bg-purple-950/10 p-5 rounded-2xl border border-purple-100/70 dark:border-purple-950/30 shadow-sm hover:-translate-y-1 transition-all duration-300 text-purple-700 dark:text-purple-450">
          <h2 className="text-xs font-bold uppercase tracking-wider">Files Uploaded</h2>
          <p className="text-3xl font-black mt-2 text-slate-855 dark:text-purple-400">{totalFiles}</p>
        </div>

        <div className="bg-indigo-50/50 dark:bg-indigo-950/10 p-5 rounded-2xl border border-indigo-100/70 dark:border-indigo-950/30 shadow-sm hover:-translate-y-1 transition-all duration-300 text-indigo-700 dark:text-indigo-455">
          <h2 className="text-xs font-bold uppercase tracking-wider">AI Solutions</h2>
          <p className="text-3xl font-black mt-2 text-slate-855 dark:text-indigo-400">{totalAIResponses}</p>
        </div>

        <div className="bg-teal-50/50 dark:bg-teal-950/10 p-5 rounded-2xl border border-teal-100/70 dark:border-teal-950/30 shadow-sm hover:-translate-y-1 transition-all duration-300 text-teal-700 dark:text-teal-450">
          <h2 className="text-xs font-bold uppercase tracking-wider">Study Hours Saved</h2>
          <p className="text-3xl font-black mt-2 text-slate-855 dark:text-teal-450">{studyHoursSaved}h</p>
        </div>
      </div>

      {/* Add Task Container */}
      <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl border border-slate-200/60 dark:border-slate-850 shadow-sm mb-8">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <span>➕</span> Add New Study Task
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Task Title</label>
            <input
              type="text"
              placeholder="e.g. Solve Calculus Worksheet"
              className="border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm dark:text-slate-250"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Subject</label>
            <input
              type="text"
              placeholder="e.g. Mathematics"
              className="border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm dark:text-slate-250"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Due Date</label>
            <input
              type="date"
              className="border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm dark:text-slate-250"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Task Priority</label>
            <select
              className="border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm dark:text-slate-250"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>
          </div>
        </div>
        <button
          onClick={handleAddTask}
          className="mt-5 bg-indigo-650 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition shadow-md shadow-indigo-500/10 text-sm"
        >
          Add Task
        </button>
      </div>

      {/* Task Card Grid */}
      <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
        <span>📋</span> Assignment Tasks ({tasks.length})
      </h2>
      <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
        {tasks.map((task) => (
          <div 
            key={task.id} 
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-850 shadow-sm relative hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden"
          >
            <div className="p-6">
              {/* Card Header */}
              <div className="flex justify-between items-start gap-4 mb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 pr-8">{task.title}</h3>
                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1 inline-block">📚 {task.subject || "No Subject"}</span>
                </div>
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="absolute top-4 right-4 text-slate-350 hover:text-red-500 transition duration-150"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Status and Priority Row */}
              <div className="flex items-center gap-3 mb-6">
                <span className={`px-2.5 py-1 text-2xs font-extrabold uppercase tracking-wider rounded-md ${
                  task.priority === "HIGH" 
                    ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30"
                    : task.priority === "MEDIUM"
                    ? "bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30"
                    : "bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-800"
                }`}>
                  {task.priority} Priority
                </span>

                <span 
                  onClick={() => handleToggleStatus(task.id)}
                  className={`px-2.5 py-1 text-2xs font-extrabold uppercase tracking-wider rounded-md cursor-pointer border hover:scale-105 transition ${
                    task.status === "COMPLETED" 
                      ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30" 
                      : "bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-450 border-amber-100 dark:border-amber-900/30"
                  }`}
                >
                  {task.status}
                </span>

                {task.due_date && (
                  <span className="text-2xs text-slate-400 dark:text-slate-500 font-semibold ml-auto">
                    📅 Due: {task.due_date}
                  </span>
                )}
              </div>

              {/* File Upload Section */}
              <div className="border-t border-slate-100 dark:border-slate-850/80 pt-4 mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500 mb-2.5">
                  📁 Assignment Files
                </h4>
                
                {/* Upload Button */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <label className="relative cursor-pointer bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-900 transition flex items-center gap-2">
                    📎 Upload Assignment
                    <input 
                      type="file" 
                      accept=".pdf,.docx,.jpg,.png,.jpeg"
                      className="hidden" 
                      onChange={(e) => handleFileUpload(task.id, e.target.files[0])} 
                    />
                  </label>
                  
                  {loadingStates[`${task.id}_upload`] && (
                    <span className="text-xs text-indigo-650 dark:text-indigo-400 flex items-center gap-1.5 font-semibold">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Uploading & processing file...
                    </span>
                  )}
                </div>

                {/* Uploaded File Names */}
                {task.files && task.files.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    {task.files.map((file) => (
                      <div key={file.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-xl text-xs border border-slate-100 dark:border-slate-900">
                        <a href={file.url} target="_blank" rel="noreferrer" className="text-indigo-650 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1.5 truncate">
                          📄 {file.name}
                        </a>
                        <span className="text-4xs text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold">PDF/Docx</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-550 mt-2 pl-1 italic">No files uploaded. Upload a worksheet to unlock AI functions.</p>
                )}
              </div>

              {/* AI Actions Row */}
              <div className="border-t border-slate-100 dark:border-slate-850/80 pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-450 dark:text-slate-550 mb-2.5">
                  🤖 AI Study Actions
                </h4>
                <div className="flex flex-wrap gap-2.5">
                  {/* Generate Solution */}
                  <button 
                    disabled={loadingStates[`${task.id}_SOLUTION`]}
                    onClick={() => handleGenerateAI(task.id, 'SOLUTION')}
                    className="flex-grow sm:flex-grow-0 bg-indigo-600 text-white px-3.5 py-2 rounded-xl hover:bg-indigo-700 disabled:bg-indigo-300 dark:disabled:bg-indigo-900/35 transition text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-600/10"
                  >
                    {loadingStates[`${task.id}_SOLUTION`] ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Solving...
                      </>
                    ) : (
                      "💡 Generate Solution"
                    )}
                  </button>

                  {/* Generate Summary */}
                  <button 
                    disabled={loadingStates[`${task.id}_SUMMARY`]}
                    onClick={() => handleGenerateAI(task.id, 'SUMMARY')}
                    className="flex-grow sm:flex-grow-0 bg-purple-600 text-white px-3.5 py-2 rounded-xl hover:bg-purple-700 disabled:bg-purple-300 dark:disabled:bg-purple-900/35 transition text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-purple-600/10"
                  >
                    {loadingStates[`${task.id}_SUMMARY`] ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Summarizing...
                      </>
                    ) : (
                      "📝 Generate Summary"
                    )}
                  </button>

                  {/* Generate Quiz */}
                  <button 
                    disabled={loadingStates[`${task.id}_QUIZ`]}
                    onClick={() => handleGenerateAI(task.id, 'QUIZ')}
                    className="flex-grow sm:flex-grow-0 bg-teal-600 text-white px-3.5 py-2 rounded-xl hover:bg-teal-700 disabled:bg-teal-300 dark:disabled:bg-teal-900/35 transition text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-teal-600/10"
                  >
                    {loadingStates[`${task.id}_QUIZ`] ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Creating Quiz...
                      </>
                    ) : (
                      "🎯 Generate Quiz"
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Collapsible Panel for AI Responses */}
            {task.ai_responses && Object.keys(task.ai_responses).length > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-850/80 bg-slate-50/20 dark:bg-slate-900/40">
                
                {/* Panel Tab Selector */}
                <div className="flex border-b border-slate-100 dark:border-slate-850/60 px-4 pt-2 gap-2 text-xs font-bold">
                  {Object.keys(task.ai_responses).map((type) => {
                    const isActive = expandedPanels[task.id] === type;
                    return (
                      <button
                        key={type}
                        onClick={() => {
                          setExpandedPanels(prev => ({
                            ...prev,
                            [task.id]: isActive ? null : type // toggle open/close on click of same tab
                          }));
                        }}
                        className={`px-3 py-2 border-b-2 transition duration-200 ${
                          isActive 
                            ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400" 
                            : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-650"
                        }`}
                      >
                        {type === 'SOLUTION' ? "💡 Solution" : type === 'SUMMARY' ? "📝 Summary" : "🎯 Practice Quiz"}
                      </button>
                    );
                  })}

                  <button 
                    onClick={() => setExpandedPanels(prev => ({ ...prev, [task.id]: null }))}
                    className="ml-auto text-slate-400 dark:text-slate-600 text-xxs tracking-wider uppercase hover:text-slate-650 px-2"
                  >
                    Close Panel
                  </button>
                </div>

                {/* Collapsible Body */}
                {expandedPanels[task.id] && task.ai_responses[expandedPanels[task.id]] && (
                  <div className="p-5 max-h-[360px] overflow-y-auto transition-all duration-300">
                    {renderResponseContent(
                      task.ai_responses[expandedPanels[task.id]].generated_answer, 
                      expandedPanels[task.id]
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
