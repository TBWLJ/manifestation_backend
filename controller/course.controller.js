const express = require('express');
const mongoose = require('mongoose');
const Course = require('../model/Course');
const Programme = require('../model/Programme');
const Semester = require('../model/Semester');
const { verifyToken, verifyTokenAndCoordinator } = require('./middleware');

const router = express.Router();

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

router.get('/courses', verifyToken, async (req, res) => {
  try {
    const { programme, semester } = req.query;
    const query = {};

    if (programme) {
      query.programme = await resolveByIdOrName(Programme, programme);
    }
    if (semester) {
      query.semester = await resolveByIdOrName(Semester, semester);
    }

    const courses = await Course.find(query)
      .sort({ code: 1, name: 1 })
      .select('name code programme semester');

    res.json({ success: true, data: courses });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching courses',
      error: error.message
    });
  }
});

router.post('/courses', verifyTokenAndCoordinator, async (req, res) => {
  try {
    const { name, code, programme, semester, description } = req.body;

    if (!code || !programme || !semester) {
      return res.status(400).json({
        success: false,
        message: 'Course code, programme, and semester are required.'
      });
    }

    const programmeId = await resolveByIdOrName(Programme, programme);
    const semesterId = await resolveByIdOrName(Semester, semester);

    const course = await Course.create({
      name: name || code,
      code,
      programme: programmeId,
      semester: semesterId,
      description: description || ''
    });

    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: course
    });
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating course'
    });
  }
});

module.exports = router;
