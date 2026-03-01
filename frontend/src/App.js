import { useState, useEffect } from "react";
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";


function App() {

  const [tasks, setTasks] = useState([]);
  const [title,setTitle]=useState("");
  const [subject,setSubject] =useState("");
  const [priority,setPriority]=useState("LOW");
  const [status,setStatus]=useState("PENDING");
  const [dueDate, setDueDate] = useState("");
  const [user, setUser] = useState(null);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    email: "",
    password: ""
  });

 const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };
  // 2. This is your 'handleClick' logic for the Login/Register button
  const handleAuth = async (e) => {
    e.preventDefault(); // Prevents the page from refreshing
    
    // Choose endpoint based on whether we are in "Login" or "Sign Up" mode
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
          // Success! Log the user in and show their real name
          setUser(data.user); 
        } else {
          alert("Account created! Now please sign in.");
          setIsSigningUp(false); // Switch back to login mode
        }
      } else {
        alert(data.message || "Something went wrong");
      }
    } catch (error) {
      console.error("Connection Error:", error);
    }
  };
  
  
  // 2. ALL FUNCTIONS/LOGIC IN THE MIDDLE
  const handleLoginSuccess = (credentialResponse) => {
    const decoded = jwtDecode(credentialResponse.credential);
    setUser(decoded); 
  };
  

 useEffect(() => {
  if (user) { // Only fetch if we have a user
    fetch("http://localhost:8000/api/tasks/") // Use localhost consistently
      .then(res => res.json())
      .then(data => {
        setTasks(data);
      })
      .catch(err => console.log("ERROR:", err));
  }
}, [user]); // Re-run whenever 'user' state changes

const handleAddTask = () => {
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
        due_date: dueDate,
      }),
    })
      .then(res => res.json())
      .then(newTask => {
        setTasks([...tasks, newTask]);
        setTitle("");
        setSubject("");
        setDueDate("");

      });
  };
  
const handleToggleStatus = (id) => {
  fetch(`http://localhost:8000/toggle_status/${id}/`, {
    method: "POST", 
  })
    .then(res => res.json())
    .then(data => {
      // Update the state array by finding the matching ID
      setTasks(tasks.map(task => 
        task.id === id ? { ...task, status: data.status } : task
      ));
    })
    .catch(err => console.error("Error toggling status:", err));
};

const handleDeleteTask = (id) => {
  // Optional: confirm before deleting
  if (!window.confirm("Are you sure you want to delete this task?")) return;

  fetch(`http://localhost:8000/delete_task/${id}/`, {
    method: "POST", // Your Django view expects a POST (or GET based on how you wrote it)
    headers: {
      "X-CSRFToken": "your-csrf-token", // Only if CSRF is enabled
    },
  })
    .then(() => {
      // Remove the deleted task from the UI state
      setTasks(tasks.filter((task) => task.id !== id));
    })
    .catch((err) => console.error("Error deleting task:", err));
};
// 3. THE CONDITIONAL RETURNS AT THE VERY BOTTOM
  
  // Login Screen
  // 3. THE CONDITIONAL RETURNS AT THE VERY BOTTOM
  
  // Login Screen (Shows first)
// 3. THE CONDITIONAL RETURNS
if (!user) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md border border-gray-200">
        <h1 className="text-3xl font-bold mb-6 text-center text-gray-800 tracking-tight">
          {isSigningUp ? "Create Account" : "Login"}
        </h1>
        
        <form className="space-y-4 mb-6" onSubmit={handleAuth}>
          {isSigningUp && (
            <>
              <input 
                name="fullName" type="text" placeholder="Full Name" 
                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" 
                onChange={handleChange} 
              />
              <input 
                name="username" type="text" placeholder="Username" 
                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" 
                onChange={handleChange} 
              />
            </>
          )}

         <input 
  name="username" // Changed from 'email'
  type="text" 
  placeholder="Username" 
  className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" 
  onChange={handleChange} 
/>

<input 
  name="password" 
  type="password" 
  placeholder="Password" 
  className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" 
  onChange={handleChange} 
/>
          
          <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-100">
            {isSigningUp ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mb-6">
          {isSigningUp ? "Already have an account?" : "New here?"} 
          <button onClick={() => setIsSigningUp(!isSigningUp)} className="text-blue-600 font-bold ml-1">
            {isSigningUp ? "Login" : "Create an account"}
          </button>
        </p>

        <div className="relative flex items-center mb-6">
          <div className="flex-grow border-t border-gray-200"></div>
          <span className="flex-shrink mx-4 text-gray-400 text-xs uppercase font-bold">Or</span>
          <div className="flex-grow border-t border-gray-200"></div>
        </div>

        <div className="flex justify-center">
          <GoogleLogin onSuccess={handleLoginSuccess} onError={() => console.log('Login Failed')} />
        </div>
      </div>
    </div>
  );
}


  // Dashboard Screen (Shows after login)
 // 2. IF USER EXISTS, SHOW DASHBOARD
 // 2. IF USER EXISTS, SHOW DASHBOARD (This is the styled version)
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      
      {/* Header Container with Welcome & Logout */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-800 tracking-tight">
            Task Dashboard
          </h1>
          <p className="text-gray-500 mt-2 text-lg">
            Welcome back, <span className="text-blue-600 font-semibold">{user.name}</span>! 👋
          </p>
        </div>
        <button 
          onClick={() => setUser(null)} 
          className="bg-red-100 text-red-600 px-4 py-2 rounded-xl hover:bg-red-200 transition font-medium border border-red-200"
        >
          Logout
        </button>
      </div>

      {/* Stats Section (Original styled boxes) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white p-6 rounded-2xl shadow-md">
          <h2 className="text-gray-500">Total Tasks</h2>
          <p className="text-3xl font-bold mt-2">{tasks.length}</p>
        </div>

        <div className="bg-green-100 p-6 rounded-2xl shadow-md text-green-700">
          <h2 className="font-semibold">Completed</h2>
          <p className="text-3xl font-bold mt-2 text-black">
            {tasks.filter(t => t.status === "COMPLETED").length}
          </p>
        </div>

        <div className="bg-yellow-100 p-6 rounded-2xl shadow-md text-yellow-700">
          <h2 className="font-semibold">Pending</h2>
          <p className="text-3xl font-bold mt-2 text-black">
            {tasks.filter(t => t.status === "PENDING").length}
          </p>
        </div>
      </div>

      {/* Add Task Container (Styled white box) */}
      <div className="bg-white p-8 rounded-2xl shadow-md mb-8 border border-gray-100">
        <h2 className="text-xl font-semibold mb-6">Add Task</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Title"
            className="border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="text"
            placeholder="Subject"
            className="border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <input
            type="date"
            className="border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <select
            className="border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none bg-white"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
        </div>
        <button
          onClick={handleAddTask}
          className="mt-6 bg-blue-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-600 transition"
        >
          Add Task
        </button>
      </div>

      {/* Task Card Grid (Styled white cards) */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => (
          <div key={task.id} className="bg-white p-6 rounded-2xl shadow-md relative hover:shadow-xl transition-all border border-gray-100">
            <button
              onClick={() => handleDeleteTask(task.id)}
              className="absolute top-4 right-4 text-gray-300 hover:text-red-500 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <h2 className="text-xl font-bold text-gray-800 pr-8">{task.title}</h2>
            <p className="text-gray-500 mt-1">{task.subject}</p>
            <div className="flex gap-3 mt-6">
              <span className="px-3 py-1 text-xs font-bold bg-blue-50 text-blue-600 rounded-full border border-blue-100">
                {task.priority}
              </span>
              <span 
  onClick={() => handleToggleStatus(task.id)}
  className={`px-3 py-1 text-xs font-bold rounded-full cursor-pointer transition-transform hover:scale-105 border ${
    task.status === "COMPLETED" 
      ? "bg-green-50 text-green-600 border-green-100" 
      : "bg-yellow-50 text-yellow-600 border-yellow-100"
  }`}
>
  {task.status}
</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


export default App;
