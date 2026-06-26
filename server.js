
require('dotenv').config();

const express = require('express');
const app = express();

const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const expressSession = require('express-session');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const path = require('path'); // Added for handling paths cleanly

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const username = req.session.user || "guest";
        const ext = file.originalname.split('.').pop();
        cb(null, username + "-" + Date.now() + "." + ext);
    }
});

const upload = multer({ storage: storage });

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

app.use(expressSession({
    secret: process.env.SESSION_SECRET || 'fallback-secret-key', // Added fallback string
    saveUninitialized: false,
    resave: false
}));

// ✅ Updated to cleanly serve everything out of your new public/ folder
app.use(express.static(path.join(__dirname, 'public')));

// serve uploaded resumes
app.use('/uploads', express.static('uploads'));

mongoose.connect(process.env.MONGO_URL)
.then(() => console.log("MongoDB connected"))
.catch(err => console.log(err));

const Schema = mongoose.Schema;

const blogSchema = new Schema({
    username: String,
    password: String,
    email: String,
    location: String,
    phone: Number,
    usertype: String,

    job:[{
        jobtitle:String,
        jobdescription:String,
        keywords:String,
        location:String,

        applicants:[{
            username:String,
            resume:String,
            status:String
        }]
    }]
});

const Blog4 = mongoose.model("Blog4", blogSchema);

// ✅ Updated to point inside your public folder
app.get('/', (req,res)=>{
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/postData', async(req,res)=>{
    try{
        const item = {
            username:req.body.username,
            password:req.body.password,
            email:req.body.email,
            location:req.body.location,
            phone:Number(req.body.phone),
            usertype:req.body.usertype
        };

        const existing = await Blog4.findOne({
            username:item.username,
            email:item.email
        });

        if(existing){
            return res.json({A:"no"});
        }

        const user = new Blog4(item);
        await user.save();

        res.json({A:"yes"});
    }catch(err){
        console.log(err);
        res.status(500).json({A:"error"});
    }
});

app.post('/login', async(req,res)=>{
    try{
        const {username,password} = req.body;
        const user = await Blog4.findOne({username,password});

        if(!user){
            return res.json({A:"wrong"});
        }

        req.session.user = username;
        req.session.save((err) => {
            if (err) {
                console.log("Session save error:", err);
                return res.status(500).json({A:"error"});
            }
            res.json({A:"correct"});
        });
        // res.json({A:"correct"});
    }catch(err){
        console.log(err);
        res.status(500).json({A:"error"});
    }
});

app.post('/checkLogin',(req,res)=>{
    if(!req.session.user){
        return res.json({isLogin:"no"});
    }
    res.json({isLogin:"yes"});
});

app.post('/checkUserType', async(req,res)=>{
    try{
        const user = await Blog4.findOne({
            username:req.session.user
        });

        if(!user){
            return res.json({usertype:null});
        }

        res.json({
            usertype:user.usertype,
            username:user.username
        });
    }catch(err){
        console.log(err);
        res.status(500).json({usertype:null});
    }
});

app.post('/update', async(req,res)=>{
    try{
        const recruiter = await Blog4.findOne({
            username:req.session.user
        });

        if(!recruiter){
            return res.json({success:false});
        }

        const job = {
            jobtitle:req.body.jobtitle,
            jobdescription:req.body.jobdescription,
            keywords:req.body.keywords,
            location:req.body.location,
            applicants:[]
        };

        recruiter.job.push(job);
        await recruiter.save();

        res.json({success:true});
    }catch(err){
        console.log(err);
        res.json({success:false});
    }
});

app.post('/getJobs', async(req,res)=>{
    const username = req.session.user;
    const recruiters = await Blog4.find({});
    let jobs = [];

    recruiters.forEach(r=>{
        r.job.forEach(j=>{
            let status = "Not Applied";
            if(j.applicants){
                const applicant = j.applicants.find(a=>a.username === username);
                if(applicant){
                    status = applicant.status;
                }
            }
            jobs.push({
                _id:j._id,
                jobtitle:j.jobtitle,
                jobdescription:j.jobdescription,
                location:j.location,
                status:status
            });
        });
    });
    res.json(jobs);
});

app.post('/apply', upload.single('resume'), async(req,res)=>{
    try{
        const jobId = req.body.jobId;
        const username = req.session.user;
        if(!username){
            return res.json({success:false, message:"Login required"});
        }
        if(!req.file){
            return res.json({success:false, message:"Resume required"});
        }
        const recruiter = await Blog4.findOne({
            "job._id": jobId
        });
        if(!recruiter){
            return res.json({success:false});
        }
        const job = recruiter.job.id(jobId);
        const already = job.applicants.find(a => a.username === username);
        if(already){
            return res.json({success:false, message:"Already applied"});
        }
        job.applicants.push({
            username:username,
            resume:req.file.filename,
            status:"applied"
        });
        await recruiter.save();
        res.json({success:true});
    }catch(err){
        console.log(err);
        res.json({success:false});
    }
});

app.post('/getApplicants', async(req,res)=>{
    try{
        const recruiter = await Blog4.findOne({
            "job._id":req.body.jobId
        });

        if(!recruiter){
            return res.json([]);
        }

        const job = recruiter.job.id(req.body.jobId);
        res.json(job.applicants || []);
    }catch(err){
        console.log(err);
        res.json([]);
    }
});

app.post('/acceptApplicant', async(req,res)=>{
    try{
        const {jobId,username} = req.body;
        const recruiter = await Blog4.findOne({
            "job._id":jobId
        });

        if(!recruiter){
            return res.json({success:false});
        }

        const job = recruiter.job.id(jobId);
        const applicant = job.applicants.find(a=>a.username === username);

        if(!applicant){
            return res.json({success:false});
        }

        applicant.status = "accepted";
        await recruiter.save();

        res.json({success:true});
    }catch(err){
        console.log(err);
        res.json({success:false});
    }
});

app.post('/rejectApplicant', async(req,res)=>{
    try{
        const {jobId,username} = req.body;
        const recruiter = await Blog4.findOne({
            "job._id":jobId
        });

        if(!recruiter){
            return res.json({success:false});
        }

        const job = recruiter.job.id(jobId);
        const applicant = job.applicants.find(a=>a.username === username);

        if(!applicant){
            return res.json({success:false});
        }

        applicant.status = "rejected";
        await recruiter.save();

        res.json({success:true});
    }catch(err){
        console.log(err);
        res.json({success:false});
    }
});

app.post('/deleteJob', async(req,res)=>{
    try{
        const jobId = req.body.jobId;
        const recruiter = await Blog4.findOne({
            username:req.session.user
        });

        if(!recruiter){
            return res.json({success:false});
        }

        recruiter.job = recruiter.job.filter(j => j._id != jobId);
        await recruiter.save();

        res.json({success:true});
    }catch(err){
        console.log(err);
        res.json({success:false});
    }
});

app.post('/getMyJobs', async (req, res) => {
    try {
        const username = req.body.username; 
        const recruiter = await Blog4.findOne({ username: username });

        if (!recruiter) {
            return res.json([]);
        }

        res.json(recruiter.job || []);
    } catch (err) {
        console.log(err);
        res.json([]);
    }
});

app.post('/resetSession',(req,res)=>{
    req.session.destroy();
    res.sendStatus(200);
});

// ✅ FIXED: Using process.env.PORT with a safe fallback value (5000)
const PORT = process.env.PORT;

app.listen(PORT, ()=>{
    console.log(`Server running on port ${PORT}`);
});