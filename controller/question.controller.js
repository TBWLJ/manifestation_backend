const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Question = require('../model/Question');
const Programme = require('../model/Programme');
const Semester = require('../model/Semester');
const Session = require('../model/Session');
const Course = require('../model/Course');
const { verifyToken, verifyTokenAndCoordinator } = require('./middleware');  // Assuming you have auth middlewar;

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

// POST route to save questions
router.post('/questions', verifyTokenAndCoordinator, async (req, res) => {
  const { questions } = req.body;

  if (!questions || questions.length === 0) {
    return res.status(400).json({ success: false, message: 'No questions provided.' });
  }

  try {
    const preparedQuestions = [];
    for (const question of questions) {
      const programmeId = await resolveByIdOrName(Programme, question.programme);
      const semesterId = await resolveByIdOrName(Semester, question.semester);
      const sessionId = await resolveByIdOrName(Session, question.session);
      const courseId = await resolveCourse(question.course, {
        programme: programmeId,
        semester: semesterId
      });

      if (!programmeId || !semesterId || !sessionId || !courseId) {
        return res.status(400).json({
          success: false,
          message: 'Programme, semester, session, and course are required for each question.'
        });
      }

      preparedQuestions.push({
        programme: programmeId,
        semester: semesterId,
        session: sessionId,
        course: courseId,
        text: question.text,
        options: question.options,
        createdBy: req.user.id
      });
    }

    const createdQuestions = await Question.insertMany(preparedQuestions);

    res.status(200).json({
      success: true,
      message: 'Questions posted successfully!',
      data: createdQuestions,
    });
  } catch (error) {
    console.error('Error posting questions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while posting questions.',
    });
  }
});

// Get all questions with filtering and pagination
router.get('/questions', verifyTokenAndCoordinator, async (req, res) => {
    try {
        const {
            programme,
            semester,
            session,
            course,
            page = 1,
            limit = 10
        } = req.query;

        // Build query based on filters
        const query = {};
        if (programme) query.programme = await resolveByIdOrName(Programme, programme);
        if (semester) query.semester = await resolveByIdOrName(Semester, semester);
        if (session) query.session = await resolveByIdOrName(Session, session);
        if (course) query.course = await resolveCourse(course, {
          programme: query.programme,
          semester: query.semester
        });

        // Execute query with pagination
        const questions = await Question.find(query)
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 })
            .populate('course', 'name code');

        // Get total count for pagination
        const total = await Question.countDocuments(query);

        res.json({
            success: true,
            data: questions,
            pagination: {
                total,
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error fetching questions:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching questions',
            error: error.message
        });
    }
});


// Get a specific question by ID
router.get('/questions/:id', verifyToken, async (req, res) => {
    try {
        const question = await Question.findById(req.params.id)
            .populate('createdBy', 'name email')
            .populate('course', 'name code')
            .populate('programme', 'name')
            .populate('semester', 'name')
            .populate('session', 'name');

        if (!question) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        res.json({
            success: true,
            data: question
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching question',
            error: error.message
        });
    }
});

// Update a question
router.put('/questions/:id', verifyToken, async (req, res) => {
    try {
        const {
            text,
            options,
            programme,
            semester,
            session,
            course
        } = req.body;

        const question = await Question.findById(req.params.id);

        if (!question) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        // Check if user is authorized to update
        if (question.createdBy.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this question'
            });
        }

        const updatePayload = {};
        if (text) updatePayload.text = text;
        if (options) updatePayload.options = options;
        if (programme) updatePayload.programme = await resolveByIdOrName(Programme, programme);
        if (semester) updatePayload.semester = await resolveByIdOrName(Semester, semester);
        if (session) updatePayload.session = await resolveByIdOrName(Session, session);
        if (course) {
          updatePayload.course = await resolveCourse(course, {
            programme: updatePayload.programme || question.programme,
            semester: updatePayload.semester || question.semester
          });
        }

        const updatedQuestion = await Question.findByIdAndUpdate(
            req.params.id,
            updatePayload,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: 'Question updated successfully',
            data: updatedQuestion
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating question',
            error: error.message
        });
    }
});

// Delete a question
router.delete('/questions/:id', verifyToken, async (req, res) => {
    try {
        const question = await Question.findById(req.params.id);

        if (!question) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        // Check if user is authorized to delete
        if (question.createdBy.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this question'
            });
        }

        await Question.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Question deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting question',
            error: error.message
        });
    }
});

module.exports = router;
