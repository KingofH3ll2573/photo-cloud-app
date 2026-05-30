// Drag and drop functionality
const photoInput = document.getElementById('photoInput');
const uploadBox = document.querySelector('.upload-box');

uploadBox.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadBox.style.background = '#e8e4ff';
});

uploadBox.addEventListener('dragleave', () => {
  uploadBox.style.background = '#f8f9ff';
});

uploadBox.addEventListener('drop', (e) => {
  e.preventDefault();

  photoInput.files = e.dataTransfer.files;

  uploadBox.style.background = '#f8f9ff';

  // Upload immediately after dropping
  uploadPhotos();
});

uploadBox.addEventListener('click', () => {
  photoInput.click();
});

photoInput.addEventListener('change', () => {
  uploadPhotos();
});
// Upload photos
async function uploadPhotos() {
  const files = photoInput.files;
  const statusDiv = document.getElementById('uploadStatus');

  if (files.length === 0) {
    statusDiv.textContent = 'Please select photos first';
    statusDiv.className = 'status-message error';
    return;
  }

  statusDiv.textContent = 'Uploading...';
  statusDiv.className = 'status-message success';

  let successCount = 0;
  let errorCount = 0;

  for (let file of files) {
    try {
      const formData = new FormData();
      formData.append('photo', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        successCount++;
      } else {
        errorCount++;
      }
    } catch (error) {
      errorCount++;
      console.error('Upload error:', error);
    }
  }

  // Show result
  if (errorCount === 0) {
    statusDiv.textContent = `✓ Successfully uploaded ${successCount} photo(s)`;
    statusDiv.className = 'status-message success';
    photoInput.value = '';
    loadAllPhotos();
  } else {
    statusDiv.textContent = `⚠ Uploaded ${successCount}, failed ${errorCount}`;
    statusDiv.className = 'status-message error';
  }

  setTimeout(() => {
    statusDiv.className = 'status-message';
  }, 5000);
}

// Load all photos
async function loadAllPhotos() {
  try {
    const response = await fetch('/api/photos');
    const photos = await response.json();
    displayPhotos(photos);
    loadCalendar();
  } catch (error) {
    console.error('Error loading photos:', error);
  }
}

// Load calendar
async function loadCalendar() {
  try {
    const response = await fetch('/api/calendar');
    const calendar = await response.json();
    const calendarContainer = document.getElementById('calendarContainer');
    
    calendarContainer.innerHTML = '';

    if (calendar.length === 0) {
      calendarContainer.innerHTML = '<p style="color: #95a5a6;">No photos yet</p>';
      return;
    }

    calendar.forEach(item => {
      const monthName = new Date(item.year, item.month).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });

      const div = document.createElement('div');
      div.className = 'calendar-item';
      div.textContent = monthName;
      div.onclick = () => loadPhotosByDate(item.year, item.month);
      calendarContainer.appendChild(div);
    });
  } catch (error) {
    console.error('Error loading calendar:', error);
  }
}

// Load photos by date
async function loadPhotosByDate(year, month) {
  try {
    const response = await fetch(`/api/photos/${year}/${month}`);
    const photos = await response.json();
    displayPhotos(photos);
  } catch (error) {
    console.error('Error loading photos:', error);
  }
}

// Display photos
function displayPhotos(photos) {
  const grid = document.getElementById('photosGrid');
  grid.innerHTML = '';

  if (photos.length === 0) {
    grid.innerHTML = '<p class="empty-message">No photos found</p>';
    return;
  }

  photos.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.innerHTML = `
      <img src="${photo.s3Url}" alt="${photo.filename}" onerror="this.src='/placeholder.png'">
      <div class="photo-overlay">
        <button class="delete-btn" onclick="deletePhoto('${photo.s3Key}')">Delete</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Delete photo
async function deletePhoto(id) {
  if (!confirm('Are you sure you want to delete this photo?')) {
    return;
  }

  try {
    const response = await fetch(`/api/photos/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      loadAllPhotos();
    } else {
      alert('Failed to delete photo');
    }
  } catch (error) {
    console.error('Error deleting photo:', error);
    alert('Error deleting photo');
  }
}

// Load photos on page load
window.addEventListener('load', () => {
  loadAllPhotos();

  // hide upload section until login
  document.querySelector('.upload-section').style.display = 'none';
  document.querySelector('.gallery').style.display = 'none';
});

async function login() {
  const password = document.getElementById('passwordInput').value;
  const status = document.getElementById('loginStatus');

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });

  if (res.ok) {
    status.textContent = "Logged in!";

    // hide login box
    document.getElementById('loginBox').style.display = 'none';

    // show upload section
    document.querySelector('.upload-section').style.display = 'block';
    document.querySelector('.gallery').style.display = 'block';
  } else {
    status.textContent = "Wrong password";
  }
}

function togglePassword() {
  const input = document.getElementById('passwordInput');

  if (input.type === 'password') {
    input.type = 'text';
  } else {
    input.type = 'password';
  }
}