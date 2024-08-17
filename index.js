require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const bcrypt = require("bcrypt");
const config = require("./config.json");
const mongoose = require("mongoose");

mongoose.connect(config.connectionString);

const User = require("./models/user.model");
const Note = require("./models/note.model");

app.use(express.json());

const jwt = require("jsonwebtoken");
const { authenticateToken } = require("./utilities");

app.use(
  cors({
    origin: "*",
  })
);

//Backend ready !!

//create acc
app.post("/register", async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName) {
    return res.status(400).json({ error: true, message: "Name is required" });
  }
  if (!email) {
    return res.status(400).json({ error: true, message: "email is required" });
  }
  if (!password) {
    return res
      .status(400)
      .json({ error: true, message: "password is required" });
  }

  const isUser = await User.findOne({ email });
  if (isUser) return res.json({ error: true, msg: "User already exists" });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({
    fullName,
    email,
    password: hashedPassword,
  });
  await user.save();
  const accessToken = jwt.sign({ user }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "30m",
  });

  return res.json({
    error: false,
    accessToken,
    user,
    message: "Registration Successfull",
  });
});

//login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({ error: true, message: "email is required" });
  }
  if (!password) {
    return res
      .status(400)
      .json({ error: true, message: "password is required" });
  }

  const userInfo = await User.findOne({ email });
  if (!userInfo)
    return res.status(400).json({ error: true, message: "Not registered" });
  let check = await bcrypt.compare(password, userInfo.password);
  if (!check)
    return res
      .status(400)
      .json({ error: true, message: "Invalid credentials" });

  const user = { user: userInfo };
  const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "36000m",
  });

  return res.json({
    error: false,
    message: "Login successfull",
    email,
    accessToken,
  });
});

//get all users
app.get("/get-user", authenticateToken, async (req, res) => {
  const { user } = req.user;

  const isUser = await User.findOne({ _id: user._id });
  if (!isUser) {
    return res.sendStatus(401);
  }
  return res.json({
    user: {
      fullName: isUser.fullName,
      email: isUser.email,
      _id: isUser._id,
      createdOn: isUser.createdOn,
    },
    message: "user found",
  });
});

//add notes
app.post("/add-note", authenticateToken, async (req, res) => {
  const { title, content, tags = [] } = req.body;
  const { user } = req.user;

  if (!title) {
    return res.status(400).json({ error: true, message: "title is required" });
  }

  if (!content) {
    return res
      .status(400)
      .json({ error: true, message: "content is required" });
  }

  try {
    const titleWords = title.split(" ");
    const updatedTags = [...new Set([...tags, ...titleWords])];

    const note = new Note({
      title,
      content,
      tags: updatedTags,
      userId: user._id,
    });
    await note.save();

    return res.json({
      error: false,
      note,
      message: "Todo added successfully",
    });
  } catch (err) {
    return res.json({
      error: true,
      message: "Server Error",
    });
  }
});

//edit notes
app.put("/edit-note/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const { title, content, isPinned } = req.body;
  const { user } = req.user;

  // Check if there's anything to update
  if (!title && !content && isPinned === undefined) {
    return res
      .status(400)
      .json({ error: true, message: "No changes provided" });
  }

  try {
    // Find the note by ID and user
    const note = await Note.findOne({ _id: noteId, userId: user._id });

    // If the note does not exist, return a 404 error
    if (!note) {
      return res.status(404).json({ error: true, message: "Todo not found" });
    }

    // Update note fields if they are provided
    if (title) {
      note.title = title;
      // Update tags based on the new title
      const titleWords = title.split(" ");
      const updatedTags = [...new Set([...titleWords])];
      note.tags = updatedTags;
    }
    if (content) note.content = content;
    if (isPinned !== undefined) note.isPinned = isPinned; // Check for undefined to allow for false value

    await note.save();

    return res.json({
      error: false,
      note,
      message: "Todo updated successfully",
    });
  } catch (error) {
    // Handle server error
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

//get all notes
app.get("/get-all-notes", authenticateToken, async (req, res) => {
  const { user } = req.user;

  try {
    const notes = await Note.find({
      userId: user._id,
    }).sort({ isPinned: -1 });

    return res.json({
      error: false,
      notes,

      message: "All todos retrived successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Server error",
    });
  }
});

//delete note
app.delete("/delete-note/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const { user } = req.user;

  try {
    const note = await Note.findOne({
      _id: noteId,
      userId: user._id,
    });
    if (!note) {
      return res.json({
        error: true,
        message: "Todo not found",
      });
    }
    await Note.deleteOne({ _id: noteId, userId: user._id });
    return res.json({
      error: true,
      message: "Todo deleted",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Server error",
    });
  }
});

//update isPinned Value
app.put("/update-note-pinned/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const { isPinned } = req.body;
  const { user } = req.user;

  try {
    const note = await Note.findOne({ _id: noteId, userId: user._id });

    if (!note) {
      return res.status(404).json({ error: true, message: "Todo not found" });
    }

    note.isPinned = !note.isPinned;

    await note.save();

    return res.json({
      error: false,
      note,
      message: "Todo updated successfully",
    });
  } catch (error) {
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

//Search Notes
app.get("/search-notes", authenticateToken, async (req, res) => {
  const { user } = req.user;
  const { query } = req.query;
  if (!query) {
    return res
      .status(400)
      .json({ error: true, message: "Search query is required" });
  }

  try {
    const matchingNotes = await Note.find({
      userId: user._id,
      $or: [
        { title: { $regex: new RegExp(query, "i") } },
        { content: { $regex: new RegExp(query, "i") } },
      ],
    });
    return res.json({
      error: false,
      notes: matchingNotes,
      message: "matching notes found",
    });
  } catch (error) {
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

app.get("/", (req, res) => {
  res.json({ hello: "user" });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT);
