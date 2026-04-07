const mongoose = require('mongoose');

const ExamSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    programme: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Programme'
    },
    semester: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Semester'
    },
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session'
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
    },
    duration: {
        type: Number,
        required: true,
        default: 2700
    },
    questions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question'
    }],
    totalQuestions: {
        type: Number,
        default: 4
    },
    passingScore: {
        type: Number,
        required: true,
        default: 60
    },
    instructions: {
        type: String,
        required: true,
        default: 'Please answer all questions carefully.'
    },
    timePerQuestion: {
        type: Number,
        required: true
    },
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['draft', 'active', 'completed', 'archived'],
        default: 'draft'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Exam', ExamSchema); 
