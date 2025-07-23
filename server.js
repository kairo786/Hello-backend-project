import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: [
//       "https://d67128d90f9c.ngrok-free.app",  // frontend ngrok URL
//       "http://10.170.249.178:3000"           // frontend local access (optional)
//     ],
//     methods: ["GET", "POST"],
//     credentials: true,
//   },
// });


const io = new Server(server, {
  cors: {
    origin: [
      // "http://10.170.249.178:3000", // Allow your IP for frontend
      // "https://23320e363067.ngrok-free.app",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});



let users = {};  // { socketId: { username, imgurl } }
let pendingCandidates = {};  // { toSocketId: [candidate1, candidate2, ...] }

io.on("connection", (socket) => {
  console.log("✅ Socket connected:", socket.id);

  // Handle user joining
  socket.on("join-user", (userData) => { 
    users[socket.id] = userData; 
    console.log("👤 User joined:", userData);
  });

  // Disconnect cleanup
  socket.on("disconnect", () => {
    if (users[socket.id]) {
      console.log(`❌ Disconnected: ${users[socket.id].username}  ${socket.id}`);
      delete users[socket.id];
      io.emit("user-list", users);
    }
    delete pendingCandidates[socket.id]; 
  });

  // Manual user-list request
  socket.on("request-user-list", () => {
    console.log("📦 request-user-list from", socket.id);
    io.emit("user-list", users);
  });

  socket.on("end-call",(data)=>{
    socket.emit("end-call");
    socket.to(data).emit("end-call");
  })
  socket.on("call-answered",(fromid)=>{
    console.log("call-anwered from user");   
    socket.emit("call-accepted");
    socket.to(fromid).emit("call-answered");
  })
  socket.on("not-answered",(from)=>{
    console.log("not-anwered from user");   
    socket.to(from).emit("not-answered");
  })
  socket.on("calling",(callto)=>{ 
    socket.to(callto.to).emit("calling",callto);
    console.log(socket.id," is 🤙calling to ",callto.to);
  })
  socket.on("call-decline",(fromid)=>{ 
    socket.to(fromid).emit("call-decline");
  })
  socket.on("miss-call",(toid)=>{ 
    socket.to(toid).emit("miss-call");
  })
  // Offer
  socket.on("offer", ({ from, to, offer }) => {
    console.log("📨 Offer received from", from, "to", to);
    io.to(to).emit("offer", { from, to, offer });  
  });

  // Answer
  socket.on("answer", ({ from, to, answer }) => {
    console.log("📩 Answer received from", from, "to", to);
    io.to(to).emit("answer", { from, to, answer });
  });

  // ICE Candidate
  socket.on("icecandidate", ({ from, to, candidate }) => { 
    console.log("❄️ ICE candidate received from", from, "to", to);

    // Save candidate in buffer
    if (!pendingCandidates[to]) {
      pendingCandidates[to] = [];
    }
    pendingCandidates[to].push(candidate);

    // Try to send immediately
    io.to(to).emit("icecandidate", { from, to, candidate });
  }); 
 
  // Handle request for buffered ICE candidates
  socket.on("request-icecandidates", () => { 
    const candidates = pendingCandidates[socket.id] || [];
    console.log("📦 Sending buffered ICE candidates to", socket.id, candidates.length);  
    candidates.forEach(candidate => {
      socket.emit("icecandidate", { from: "server-buffer", to: socket.id, candidate });
    });
    // Clear after sending
    pendingCandidates[socket.id] = []; 
  });
});

// server.listen(3001, () => {
//   console.log("🚀 Server listening on http://localhost:3001");
// });
server.listen(3001, "0.0.0.0", () => {
  console.log("Server running on http://0.0.0.0:3001");
});
