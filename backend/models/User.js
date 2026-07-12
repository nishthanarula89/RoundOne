const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // hashed, never plain text
  role: { type: String, default: "SDE" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);