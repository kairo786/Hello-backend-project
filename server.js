//server.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { getUserCollection } from "./models/Test.js";
import mongoose from "mongoose";
const app = express();

app.use(cors());            // CORS enable
app.use(express.json());    // JSON body parsing
app.use(express.urlencoded({ extended: true })); // form-data parsing
dotenv.config(); // .env load karega
connectDB(); // DB se connect hoga


app.post("/send-message", async (req, res) => {
  const { senderEmail, receiverEmail, message } = req.body;
  try {
    const SenderCollection = getUserCollection(senderEmail);
    const receiverCollection = getUserCollection(receiverEmail);

     // एक common _id generate करेंगे 
    const messageId = new mongoose.Types.ObjectId();

    // const messageObject = {
    //   _id: messageId,
    //   text: message,
    //   sender: senderEmail,
    //   timestamp: new Date()
    // };

    await SenderCollection.updateOne(
      { with: receiverEmail },
      { $push: { messages: { _id: messageId, text: message, sender: senderEmail } } },
      { upsert: true }
    );
    await receiverCollection.updateOne(
      { with: senderEmail },
      { $push: { messages: { _id: messageId, text: message, sender: senderEmail } } },
      { upsert: true }
    )
    const data = await SenderCollection.find();
    res.json({ msg: "Message stored via GET request!\n", data });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error storing message");
  }
});

// Get messages between sender and a specific receiver  
app.get("/get-messages", async (req, res) => {
  const senderEmail = req.query.sender;   // query param
  const receiverEmail = req.query.receiver;

  try {
    const SenderCollection = getUserCollection(senderEmail);
    const chatDoc = await SenderCollection.findOne({ with: receiverEmail });
    if (!chatDoc) {
      console.log('empty msg array');
      return res.json({ messages: [] }); // कोई chat नहीं है तो empty array
    }

    res.json({ messages: chatDoc.messages });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching messages");
  }
});

app.delete("/delete-message", async (req, res) => {
  const { senderEmail, receiverEmail, messageId, kisko } = req.body;

  try {
    const SenderCollection = getUserCollection(senderEmail);

    // Sender side: सिर्फ text change कर देंगे
    await SenderCollection.updateOne(
      { with: receiverEmail, "messages._id": messageId },
      {
        $set: {
          "messages.$.text": " You deleted this message",
          "messages.$.deleted": true
        }
      }
    );

    // अगर "everyone" delete करना है तो receiver side भी change करेंगे
    if (kisko === "everyone") {  
      const ReceiverCollection = getUserCollection(receiverEmail);

      await ReceiverCollection.updateOne( 
        { with: senderEmail, "messages._id": messageId },
        {
          $set: {
            "messages.$.text": "🗑️ This message was deleted",
            "messages.$.deleted": true
          }
        }
      );
    }

    res.json({ success: true, msg: "Message deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Error deleting message" });
  }
});


app.put("/edit-message", async (req, res) => {
  const { senderEmail, receiverEmail, messageId, newText } = req.body;

  try {
    const SenderCollection = getUserCollection(senderEmail);
    const receiverCollection = getUserCollection(receiverEmail);

    await SenderCollection.updateOne(
      { with: receiverEmail, "messages._id": messageId },
      { $set: { "messages.$.text": newText } }
    );
    await receiverCollection.updateOne(
      { with: senderEmail, "messages._id": messageId },
      { $set: { "messages.$.text": newText } }
    );

    res.json({ success: true, msg: "Message updated successfully" });
    console.log('msg edited to :',newText);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Error updating message" });
  }
});


const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      // "http://10.170.249.178:3000", // Allow your IP for frontend
      "https://hello-front-or8v.vercel.app",
      // "http://localhost:3000",
      "capacitor://localhost"   // capacitor app
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


  socket.on("sourcetext", ({ langcode, message, toid }) => {
    console.log("msg received ", message);
    socket.to(toid).emit("sourcetext", { langcode, message });
  });
  socket.on("translatelang-request", (data) => {
    socket.to(data).emit("translatelang-request");
  })
  socket.on("mic-request-accepted", (toid) => {
    socket.to(toid).emit("mic-request-accepted");
  })
  socket.on("mic-request-stopped", (toid) => {
    socket.to(toid).emit("mic-request-stopped");
  })
  socket.on("cancle-mic", (toid) => {
    socket.to(toid).emit("cancle-mic");
  })
  socket.on("give-mic", (toid) => {
    console.log('give mic receives from toid', toid);
    socket.to(toid).emit("give-mic");
  });
  socket.on("end-call", (data) => {
    socket.emit("end-call");
    socket.to(data).emit("end-call");
  })
  socket.on("call-answered", (fromid) => {
    console.log("call-anwered from user");
    socket.emit("call-accepted");
    socket.to(fromid).emit("call-answered");
  })
  socket.on("not-answered", (from) => {
    console.log("not-anwered from user");
    socket.to(from).emit("not-answered");
  })
  socket.on("calling", (callto) => {
    socket.to(callto.to).emit("calling", callto);
    console.log(socket.id, " is 🤙calling to ", callto.to);
  })
  socket.on("call-decline", (fromid) => {
    socket.to(fromid).emit("call-decline");
  })
  socket.on("miss-call", (toid) => {
    socket.to(toid).emit("miss-call");
  })
  socket.on("open-chat", (receiversocketid) => {
    socket.to(receiversocketid).emit("open-chat");
  });

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

server.listen(3001, "0.0.0.0", () => {
  console.log("Server running on http://0.0.0.0:3001");
});

