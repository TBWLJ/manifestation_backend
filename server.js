const express = require("express");
const moongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoute = require("./controller/auth")
const userRoute = require("./controller/users.controller")
const examRoutes = require('./controller/exam.controller');
const quizRoutes = require('./controller/quiz.controller');
const questionRoutes = require('./controller/question.controller');
const courseRoutes = require('./controller/course.controller');

const app = express();

app.use(cors());
dotenv.config();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

moongoose
    .connect(process.env.MONGODB_URL)
    .then(() => console.log("Database connected successfully"))
    .catch((err) => {
        console.log("Error connection to the database", err)
    });


app.use('/api/auth/', authRoute);
app.use('/api/user/', userRoute);
app.use('/api/exam/', examRoutes);
app.use('/api/quiz/', quizRoutes);
app.use('/api/question/', questionRoutes);
app.use('/api/course/', courseRoutes);


app.listen(5000, () => {
    console.log("Server running");
});
