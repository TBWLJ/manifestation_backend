const express = require('express');
const router = express.Router();
const Exam = require('../model/Exam');
const ExamResult = require("../model/ExamResult")
const Programme = require('../model/Programme');
const Semester = require('../model/Semester');
const Session = require('../model/Session');
const Course = require('../model/Course');
const Question = require('../model/Question');
const { verifyToken, verifyTokenAndCoordinator } = require('./middleware');
const mongoose = require('mongoose');

const isObjectId = (value) =>
    mongoose.Types.ObjectId.isValid(value) &&
    String(new mongoose.Types.ObjectId(value)) === String(value);

const resolveByIdOrName = async (Model, value) => {
    if (!value) return null;
    if (isObjectId(value)) return value;
    const doc = await Model.findOne({ name: value });
    if (!doc) throw new Error(`${Model.modelName} not found for "${value}"`);
    return doc._id;
};

const resolveCourse = async (value, extraQuery) => {
    if (!value) return null;
    if (isObjectId(value)) return value;
    const doc = await Course.findOne({
        ...extraQuery,
        $or: [{ code: value }, { name: value }]
    });
    if (!doc) throw new Error(`Course not found for "${value}"`);
    return doc._id;
};

// Create a new exam
router.post('/exams', verifyTokenAndCoordinator, async (req, res) => {
    try {
        const { title, duration, questionIds, passingScore, instructions, programme, semester, session, course } = req.body;

        const programmeId = await resolveByIdOrName(Programme, programme);
        const semesterId = await resolveByIdOrName(Semester, semester);
        const sessionId = await resolveByIdOrName(Session, session);
        const courseId = await resolveCourse(course, {
            programme: programmeId,
            semester: semesterId
        });

        let finalQuestionIds = questionIds;
        if (!finalQuestionIds || finalQuestionIds.length === 0) {
            if (!courseId || !sessionId) {
                return res.status(400).json({
                    success: false,
                    message: 'Provide questionIds or specify course and session to generate an exam.'
                });
            }
            const query = { course: courseId, session: sessionId };
            if (programmeId) query.programme = programmeId;
            if (semesterId) query.semester = semesterId;

            const foundQuestions = await Question.find(query).select('_id');
            if (!foundQuestions.length) {
                return res.status(404).json({
                    success: false,
                    message: 'No questions found for selected course.'
                });
            }
            finalQuestionIds = foundQuestions.map(q => q._id);
        }

        // Calculate default duration based on number of questions
        // Assuming average 2 minutes per question plus 15 minutes buffer
        const calculatedDuration = (finalQuestionIds.length * 2 * 60) + (15 * 60);
        
        const exam = new Exam({
            title,
            duration: duration || calculatedDuration, // Use provided duration or calculated one
            questions: finalQuestionIds,
            totalQuestions: finalQuestionIds.length,
            passingScore: passingScore || 60, // Default passing score of 60%
            instructions: instructions || 'Please answer all questions.',
            createdBy: req.user.id,
            programme: programmeId,
            semester: semesterId,
            session: sessionId,
            course: courseId,
            timePerQuestion: Math.floor((duration || calculatedDuration) / finalQuestionIds.length),
            difficulty: 'medium', // You can calculate this based on questions' difficulty
            status: 'draft' // Add a status field to control exam visibility
        });

        const savedExam = await exam.save();

        res.status(201).json({
            success: true,
            message: 'Exam created successfully',
            data: savedExam
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error creating exam',
            error: error.message
        });
    }
});

// Get exam with questions
router.get('/exams/:id', verifyToken, async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id)
            .populate('questions')
            .populate('createdBy', 'name email');

        if (!exam) {
            return res.status(404).json({
                success: false,
                message: 'Exam not found'
            });
        }

        // Calculate time remaining if exam is in progress
        const timeRemaining = exam.duration; // You'll need to implement this based on start time

        // Don't send correct answers to students
        const sanitizedQuestions = exam.questions.map(q => ({
            _id: q._id,
            text: q.text,
            options: q.options.map(opt => ({
                text: opt.text,
                _id: opt._id
            })),
            points: q.points || 1, // Add points per question
            type: q.type // Add question type (MCQ, essay, etc.)
        }));

        res.json({
            success: true,
            data: {
                ...exam._doc,
                questions: sanitizedQuestions,
                timeRemaining,
                totalPoints: sanitizedQuestions.reduce((sum, q) => sum + (q.points || 1), 0)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching exam',
            error: error.message
        });
    }
});

// Submit exam answers
router.post('/exams/:id/submit', verifyToken, async (req, res) => {
    try {
        const { answers, timeSpent } = req.body;
        const examId = req.params.id;
        const userId = req.user.id;

        // Verify if the exam is still valid to submit
        const exam = await Exam.findById(examId).populate('questions');
        
        if (!exam) {
            return res.status(404).json({
                success: false,
                message: 'Exam not found'
            });
        }

        // Check if submission is within time limit
        if (timeSpent > exam.duration) {
            return res.status(400).json({
                success: false,
                message: 'Exam time limit exceeded'
            });
        }

        // Calculate score
        let totalScore = 0;
        let totalPossibleScore = 0;

        const gradedAnswers = answers.map(answer => {
            const question = exam.questions.find(q => q._id.toString() === answer.questionId);
            if (!question) return null;

            const selectedOption = answer.selectedOption;
            const optionById = question.options.id(selectedOption);
            const optionByText = question.options.find(opt => opt.text === selectedOption);
            const optionByIndex = Number.isInteger(selectedOption) ? question.options[selectedOption] : null;
            const chosenOption = optionById || optionByText || optionByIndex;
            const isCorrect = !!(chosenOption && chosenOption.isCorrect);
            const points = question.points || 1;
            totalPossibleScore += points;
            
            if (isCorrect) {
                totalScore += points;
            }

            return {
                questionId: answer.questionId,
                selectedOption: answer.selectedOption,
                isCorrect,
                points: isCorrect ? points : 0
            };
        });

        // Calculate percentage score
        const percentageScore = totalPossibleScore ? (totalScore / totalPossibleScore) * 100 : 0;

        // Save exam result
        const examResult = new ExamResult({
            exam: examId,
            user: userId,
            answers: gradedAnswers,
            score: totalScore,
            totalPossibleScore,
            percentageScore,
            timeSpent,
            submittedAt: new Date(),
            passed: percentageScore >= exam.passingScore
        });

        await examResult.save();

        res.json({
            success: true,
            message: 'Exam submitted successfully',
            data: {
                examId,
                score: totalScore,
                totalPossibleScore,
                percentageScore,
                passed: percentageScore >= exam.passingScore,
                submittedAt: new Date()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error submitting exam',
            error: error.message
        });
    }
});

module.exports = router; 
