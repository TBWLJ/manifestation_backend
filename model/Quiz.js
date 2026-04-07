// models/Quiz.js
const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
  programme: { type: mongoose.Schema.Types.ObjectId, ref: 'Programme', required: true },
  semester: { type: mongoose.Schema.Types.ObjectId, ref: 'Semester', required: true },
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
  totalQuestions: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Quiz', quizSchema);
