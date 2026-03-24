require('dotenv').config(); // 🔥 Top-la dhaan idhu irukkanum
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
// 🔥 Socket.io dependencies
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json({ limit: '50mb' })); 
app.use(cors());
app.use(express.static(__dirname)); 

// ================= MODELS (SCHEMAS) =================

const Admin = mongoose.model('Admin', new mongoose.Schema({
  username: { type: String, required: true, unique: true }, 
  password: { type: String, required: true }
}));

const Batch = mongoose.model('Batch', new mongoose.Schema({
  batch_name: { type: String, required: true }
}));

const Student = mongoose.model('Student', new mongoose.Schema({
  batch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  student_name: String,
  student_age: Number,
  face_data: String // AI Descriptors
}));

const Attendance = mongoose.model('Attendance', new mongoose.Schema({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  attendance_date: String, // Format: YYYY-MM-DD
  status: { type: String, default: 'Present' }
}));

const Fees = mongoose.model('Fees', new mongoose.Schema({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  month: Number,
  year: Number,
  status: { type: String, default: 'Unpaid' },
  paid_date: String,
  amount: { type: Number, default: 0 }
}));

// ================= MONGODB CONNECTION =================
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/boxing_club_db"; 

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected (Atlas/Local) ✅"))
  .catch(err => console.log("MongoDB Connection Error ❌", err));

// ================= SOCKET.IO =================

io.on("connection", (socket) => {
  console.log("A user connected: " + socket.id);
  socket.on("video_frame", (data) => {
    socket.broadcast.emit("mobile_frame", { image: data.image });
  });
  socket.on("disconnect", () => console.log("User disconnected"));
});

app.get("/", (req, res) => {
  res.send("Boxing Club Backend (MongoDB) Running with Socket.io 🥊");
});

// ================= ADMIN ROUTES (Authentication) =================

app.post("/register-admin", async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
        return res.status(400).json({ success: false, message: "Username already taken ⚠️" });
    }
    const admin = new Admin({ username, password });
    await admin.save();
    res.json({ success: true, message: "Admin Registered Successfully ✅" });
  } catch (err) { 
    res.status(500).json({ success: false, message: "Error registering admin" }); 
  }
});

app.post("/login-admin", async (req, res) => {
  try {
    const admin = await Admin.findOne({ username: req.body.username, password: req.body.password });
    if (admin) {
      res.json({ success: true, message: "Login Successful ✅" });
    } else {
      res.status(401).json({ success: false, message: "Invalid Username or Password ❌" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// ================= BATCH ROUTES =================

app.post("/create-batch", async (req, res) => {
  try {
    const batch = new Batch({ batch_name: req.body.batch_name });
    await batch.save();
    res.json({ success: true, message: "Batch Created ✅" });
  } catch (err) { res.status(500).json({ success: false, message: "Error creating batch ❌" }); }
});

app.get("/get-batches", async (req, res) => {
  try {
    const batches = await Batch.find().sort({ _id: -1 });
    const formatted = batches.map(b => ({ id: b._id, batch_name: b.batch_name }));
    res.json({ success: true, batches: formatted });
  } catch (err) { res.status(500).json({ success: false, message: "Error fetching batches ❌" }); }
});

// ================= STUDENT ROUTES =================

app.post("/add-student", async (req, res) => {
  try {
    const student = new Student(req.body);
    await student.save();
    res.json({ success: true, message: "Student Added Successfully ✅" });
  } catch (err) { res.status(500).json({ success: false, message: "Error adding student ❌" }); }
});

app.get("/get-students/:batch_id", async (req, res) => {
  try {
    const students = await Student.find({ batch_id: req.params.batch_id });
    const formatted = students.map(s => ({ 
      id: s._id, 
      student_name: s.student_name, 
      student_age: s.student_age, 
      face_data: s.face_data 
    }));
    res.json({ success: true, students: formatted });
  } catch (err) { res.status(500).json({ success: false, message: "Error fetching students ❌" }); }
});

// ================= ATTENDANCE ROUTES =================

app.post("/mark-attendance-face", async (req, res) => {
  try {
    const { student_id } = req.body;
    const today = new Date().toISOString().split("T")[0];

    const existing = await Attendance.findOne({ student_id, attendance_date: today });
    if (existing) return res.json({ success: false, message: "Already Marked Today ⚠️" });

    const att = new Attendance({ student_id, attendance_date: today, status: 'Present' });
    await att.save();
    res.json({ success: true, message: "Attendance Marked Successfully ✅", student_id });
  } catch (err) { res.status(500).json({ success: false, message: "Error marking attendance ❌" }); }
});

app.get("/get-attendance/:student_id/:month/:year", async (req, res) => {
  try {
    const { student_id, month, year } = req.params;
    const regex = new RegExp(`^${year}-${month.padStart(2, '0')}`);
    const results = await Attendance.find({ student_id, attendance_date: { $regex: regex } });
    res.json({ success: true, attendance: results });
  } catch (err) { res.status(500).json({ success: false, message: "Error fetching attendance ❌" }); }
});

// 🔥 NEW: Route to get attendance for a whole batch for a specific date
app.get("/get-batch-attendance-date/:batch_id/:day/:month/:year", async (req, res) => {
  try {
    const { batch_id, day, month, year } = req.params;
    const targetDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    
    // First find all students in this batch
    const students = await Student.find({ batch_id });
    const studentIds = students.map(s => s._id);

    // Find attendance records for these students on the specific date
    const records = await Attendance.find({ 
      student_id: { $in: studentIds }, 
      attendance_date: targetDate 
    });

    res.json({ success: true, records });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching batch attendance ❌" });
  }
});

// ================= FEES ROUTES =================

app.get("/get-fees-status/:batch_id/:month/:year", async (req, res) => {
  try {
    const { batch_id, month, year } = req.params;
    const students = await Student.find({ batch_id }).sort({ student_name: 1 });
    
    let feesData = [];
    for(let s of students) {
      const fee = await Fees.findOne({ student_id: s._id, month, year });
      feesData.push({
        id: s._id,
        student_name: s.student_name,
        status: fee ? fee.status : 'Unpaid',
        paid_date: fee ? fee.paid_date : null,
        amount: fee ? fee.amount : 0
      });
    }
    res.json({ success: true, fees: feesData });
  } catch (err) { res.status(500).json({ success: false, message: "Error fetching fees list ❌" }); }
});

app.post("/mark-fees-paid", async (req, res) => {
  try {
    const { student_id, month, year, paid_date, amount } = req.body;
    await Fees.findOneAndUpdate(
      { student_id, month, year },
      { status: 'Paid', paid_date, amount: amount || 0 },
      { upsert: true }
    );
    res.json({ success: true, message: "Fees Marked as Paid ✅" });
  } catch (err) { res.status(500).json({ success: false, message: "Error updating fees ❌" }); }
});

// ================= DELETE ROUTES =================

app.delete("/delete-student/:id", async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    await Attendance.deleteMany({ student_id: req.params.id });
    await Fees.deleteMany({ student_id: req.params.id });
    res.json({ success: true, message: "Student Deleted Successfully 🗑️" });
  } catch (err) { res.status(500).json({ success: false, message: "Error deleting student ❌" }); }
});

app.delete("/delete-batch/:id", async (req, res) => {
  try {
    await Batch.findByIdAndDelete(req.params.id);
    await Student.deleteMany({ batch_id: req.params.id });
    res.json({ success: true, message: "Batch Deleted Successfully 🗑️" });
  } catch (err) { res.status(500).json({ success: false, message: "Error deleting batch ❌" }); }
});

// Port configuration
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with Socket.io 🚀`);
});