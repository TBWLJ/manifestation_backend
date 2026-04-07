const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  programme: { type: mongoose.Schema.Types.ObjectId, ref: 'Programme', required: true },
  semester: { type: mongoose.Schema.Types.ObjectId, ref: 'Semester', required: true },
  description: { type: String, default: '' },
}, { timestamps: true });

courseSchema.index({ programme: 1, semester: 1, code: 1 }, { unique: true });

courseSchema.pre('validate', async function (next) {
  try {
    if (!this.isNew) return next();
    const count = await this.constructor.countDocuments({
      programme: this.programme,
      semester: this.semester,
    });
    if (count >= 8) {
      return next(new Error('Each semester can only have 8 courses for a programme.'));
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

module.exports = mongoose.model('Course', courseSchema);
