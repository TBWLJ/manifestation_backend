const express = require('express');
const router = express.Router();
const Programme = require('../model/Programme');
const Session = require('../model/Session');
const Semester = require('../model/Semester');
const Course = require('../model/Course');
const Quiz = require('../model/Quiz');
const Question = require('../model/Question');
const { verifyToken } = require('./middleware');

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

const sanitizeQuestions = (questions) => questions.map(q => ({
  _id: q._id,
  text: q.text,
  options: q.options.map(opt => ({
    text: opt.text,
    _id: opt._id
  }))
}));

const buildReviewQuestions = (questions) => questions.map(q => {
  const correctOption = q.options.find(opt => opt.isCorrect);
  return {
    _id: q._id,
    text: q.text,
    options: q.options.map(opt => ({
      text: opt.text,
      _id: opt._id,
      isCorrect: opt.isCorrect
    })),
    correctAnswer: correctOption ? correctOption.text : null
  };
});

router.post('/start-quiz', verifyToken, async (req, res) => {
  const { programme, semester, session, course, limit } = req.body;

  try {
    const programmeId = await resolveByIdOrName(Programme, programme);
    const semesterId = await resolveByIdOrName(Semester, semester);
    const sessionId = await resolveByIdOrName(Session, session);

    if (!programmeId || !semesterId || !sessionId) {
      return res.status(400).json({ success: false, message: 'Programme, semester, and session are required.' });
    }

    const courseId = await resolveCourse(course, {
      programme: programmeId,
      semester: semesterId
    });

    if (!courseId) {
      return res.status(400).json({ success: false, message: 'Course is required for quiz.' });
    }

    // Find the quiz based on programme, semester, and session
    const quiz = await Quiz.findOne({
      programme: programmeId,
      semester: semesterId,
      session: sessionId,
      course: courseId
    }).populate('questions');

    if (quiz) {
      return res.json({ success: true, quiz: { ...quiz._doc, questions: sanitizeQuestions(quiz.questions) } });
    }

    const questionsQuery = {
      programme: programmeId,
      semester: semesterId,
      session: sessionId,
      course: courseId
    };

    let questions = await Question.find(questionsQuery).sort({ createdAt: -1 });
    if (limit) {
      questions = questions.slice(0, parseInt(limit));
    }

    if (!questions.length) {
      return res.status(404).json({ success: false, message: 'No questions found for selected course.' });
    }

    const createdQuiz = await Quiz.create({
      programme: programmeId,
      semester: semesterId,
      session: sessionId,
      course: courseId,
      questions: questions.map(q => q._id),
      totalQuestions: questions.length
    });

    res.json({
      success: true,
      quiz: { ...createdQuiz._doc, questions: sanitizeQuestions(questions) }
    });
  } catch (error) {
    console.error(error);   
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.post('/review-questions', verifyToken, async (req, res) => {
  const { programme, semester, session, course } = req.body;
  try {
    const programmeId = await resolveByIdOrName(Programme, programme);
    const semesterId = await resolveByIdOrName(Semester, semester);
    const sessionId = await resolveByIdOrName(Session, session);

    if (!programmeId || !semesterId || !sessionId) {
      return res.status(400).json({ success: false, message: 'Programme, semester, and session are required.' });
    }

    const courseId = await resolveCourse(course, {
      programme: programmeId,
      semester: semesterId
    });

    if (!courseId) {
      return res.status(400).json({ success: false, message: 'Course is required for review.' });
    }

    const questions = await Question.find({
      programme: programmeId,
      semester: semesterId,
      session: sessionId,
      course: courseId
    }).sort({ createdAt: -1 });

    if (!questions.length) {
      return res.status(404).json({ success: false, message: 'No questions found for selected course.' });
    }

    return res.json({
      success: true,
      quiz: {
        questions: buildReviewQuestions(questions)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.post('/submit-quiz', verifyToken, async (req, res) => {
  try {
    const { answers = [] } = req.body;
    if (!answers.length) {
      return res.status(400).json({ success: false, message: 'No answers provided.' });
    }

    const questionIds = answers.map(a => a.questionId);
    const questions = await Question.find({ _id: { $in: questionIds } });

    if (!questions.length) {
      return res.status(404).json({ success: false, message: 'Questions not found.' });
    }

    const questionMap = new Map(questions.map(q => [String(q._id), q]));

    let correctAnswers = 0;
    const breakdown = answers.map((answer) => {
      const question = questionMap.get(String(answer.questionId));
      if (!question) return null;

      const selectedOption = answer.selectedOption;
      const optionById = question.options.id(selectedOption);
      const optionByText = question.options.find(opt => opt.text === selectedOption);
      const optionByIndex = Number.isInteger(selectedOption) ? question.options[selectedOption] : null;
      const chosenOption = optionById || optionByText || optionByIndex;
      const isCorrect = !!(chosenOption && chosenOption.isCorrect);
      if (isCorrect) correctAnswers += 1;

      const correctOption = question.options.find(opt => opt.isCorrect);
      return {
        questionId: question._id,
        questionText: question.text,
        selectedOption: chosenOption ? chosenOption.text : null,
        correctAnswer: correctOption ? correctOption.text : null,
        isCorrect
      };
    }).filter(Boolean);

    const totalQuestions = questions.length;
    const percentageScore = totalQuestions ? (correctAnswers / totalQuestions) * 100 : 0;

    return res.json({
      success: true,
      totalQuestions,
      correctAnswers,
      percentageScore,
      breakdown
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
