console.log("TEST");
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AWS = require('aws-sdk');
const heicConvert = require('heic-convert');
const session = require('express-session');

require('dotenv').config();

const app = express();

 if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
    console.log('📁 Created uploads folder');
  }

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(session({
  secret: 'photo-app-secret',
  resave: false,
  saveUninitialized: false
}));
// Login/logout
app.post('/api/login', (req, res) => {
  const { password } = req.body;

  if (password === process.env.APP_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ success: true });
  }

  res.status(401).json({ error: 'Wrong password' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ error: 'Not logged in' });
}


// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|heic|heif/;

  const extOk = allowedTypes.test(file.originalname.toLowerCase());
  const mimeOk = allowedTypes.test(file.mimetype.toLowerCase());

  if (extOk || mimeOk) {
    cb(null, true);
  } else {
    console.log("BLOCKED FILE:");
    console.log("name:", file.originalname);
    console.log("mime:", file.mimetype);
    cb(new Error("Only image files allowed"));
  }
}
});

// Configure AWS S3 (using Backblaze B2 as an S3-compatible service)
const s3 = new AWS.S3({
  endpoint: process.env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com',
  accessKeyId: process.env.B2_KEY_ID,
  secretAccessKey: process.env.B2_APP_KEY,
  region: process.env.B2_REGION || 'us-east-005',
  s3ForcePathStyle: true
});

// Store photos metadata (in production, use a database)


// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Upload endpoint
app.post('/api/upload', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Read file
    let fileContent = fs.readFileSync(req.file.path);
let contentType = req.file.mimetype;
let fileName = req.file.originalname;

console.log("FILE TYPE:", req.file.mimetype);
console.log("FILE NAME:", req.file.originalname);
// Convert HEIC to JPG
if (
  req.file.originalname.toLowerCase().endsWith('.heic') ||
  req.file.originalname.toLowerCase().endsWith('.heif')
) {
  const outputBuffer = await heicConvert({
    buffer: fileContent,
    format: 'JPEG',
    quality: 1
  });

  fileContent = outputBuffer;
  contentType = 'image/jpeg';

  // rename extension
  fileName = fileName.replace(/\.(heic|heif)$/i, '.jpg');
}
    
    // Upload to S3/B2
    const params = {
      Bucket: process.env.B2_BUCKET || 'photo-storage',
      Key: `photos/${Date.now()}-${fileName}`,
      Body: fileContent,
      ContentType: contentType
    };

    const uploadResult = await s3.upload(params).promise();
    console.log("UPLOAD RESULT:", uploadResult);
    console.log("LOCATION:", uploadResult.Location);
    // Extract date info
    const uploadDate = new Date();
    const year = uploadDate.getFullYear();
    const month = uploadDate.getMonth();

    const photoData = {
  id: Date.now(),
  filename: req.file.originalname,

  // IMPORTANT: exact key used for deleting later
  s3Key: params.Key,

  // Public image URL
  s3Url: `https://${process.env.B2_BUCKET}.${process.env.B2_ENDPOINT}/${params.Key}`,

  uploadDate: uploadDate.toISOString(),
  year: year,
  month: month
};

    

    // Delete local file
    fs.unlinkSync(req.file.path);

    res.json({ 
      success: true, 
      message: 'Photo uploaded successfully',
      photo: photoData 
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Get all photos
app.get('/api/photos', async (req, res) => {
  try {

    const data = await s3.listObjectsV2({
      Bucket: process.env.B2_BUCKET,
      Prefix: 'photos/'
    }).promise();

    const photos = data.Contents.map(file => {

      const fileName = file.Key.split('/').pop();

      return {
        id: file.Key,
        filename: fileName,
        s3Key: file.Key,
        s3Url: `https://${process.env.B2_BUCKET}.${process.env.B2_ENDPOINT}/${file.Key}`,
        uploadDate: file.LastModified,

        year: new Date(file.LastModified).getFullYear(),
        month: new Date(file.LastModified).getMonth()
      };

    }).sort((a, b) => {
      return new Date(b.uploadDate) - new Date(a.uploadDate);
    });

    res.json(photos);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: error.message
    });

  }
});

// Get photos by year and month
app.get('/api/photos/:year/:month', (req, res) => {
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);

  const filtered = photosDatabase.filter(photo => 
    photo.year === year && photo.month === month
  );

  res.json(filtered);
});

// Delete photo
app.delete('/api/photos/:id', requireAuth, async (req, res) => {
  try {
    const photoId = parseInt(req.params.id);

    const photoKey = decodeURIComponent(req.params.id);

    if (!photoKey) {
      return res.status(404).json({
        error: 'Photo not found'
      });
    }

    console.log("DELETING:", photoKey);

    // Delete from Backblaze
    const versions = await s3.listObjectVersions({
  Bucket: process.env.B2_BUCKET,
  Prefix: photoKey
}).promise();

for (const version of versions.Versions || []) {
  await s3.deleteObject({
    Bucket: process.env.B2_BUCKET,
    Key: version.Key,
    VersionId: version.VersionId
  }).promise();
}

for (const marker of versions.DeleteMarkers || []) {
  await s3.deleteObject({
    Bucket: process.env.B2_BUCKET,
    Key: marker.Key,
    VersionId: marker.VersionId
  }).promise();
}

    console.log("DELETED FROM BACKBLAZE");

    // Remove from memory database
    photosDatabase = photosDatabase.filter(
      p => p.id !== photoId
    );

    res.json({
      success: true
    });

  } catch (error) {
    console.error("DELETE ERROR:", error);

    res.status(500).json({
      error: error.message
    });
  }
});
// Get available years and months
app.get('/api/calendar', (req, res) => {
  const yearMonths = new Set();
  
  photosDatabase.forEach(photo => {
    yearMonths.add(`${photo.year}-${photo.month}`);
  });

  const calendar = Array.from(yearMonths).map(ym => {
    const [year, month] = ym.split('-');
    return { year: parseInt(year), month: parseInt(month) };
  }).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  res.json(calendar);
});

const PORT = process.env.PORT || 3000;

console.log('Starting server...');
console.log('PORT:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);

app.listen(PORT, () => {
  console.log('✅ SERVER STARTED SUCCESSFULLY!');
  console.log(`📍 http://localhost:${PORT}`);
});

console.log('Server file loaded - waiting for connections...');