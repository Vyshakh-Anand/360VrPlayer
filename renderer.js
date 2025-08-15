const { ipcRenderer } = require('electron');
const THREE = require('three');
const fs = require('fs');
const path = require('path');

// Global variables
let scene, camera, renderer;
let sphere;
let videoElement, videoTexture;
let isPlaying = false;
let videoMode = 'mono';
let isVideoLoaded = false;
let mouseDown = false;
let mouseX = 0, mouseY = 0;
let lon = 0, lat = 0;
let targetLon = 0, targetLat = 0;
let phi = 0, theta = 0;
let resolutionScale = 1.0; 
let currentSpeed = 1.0;
let isFullscreen = false;
let brightnessValue = 1.0; 
let controlsLocked = false;
let audioContext;
let audioSource;
let analyser;
let equalizer;
let compressor;
let spatialAudio;
let currentToneMapping = THREE.LinearToneMapping;
let currentEncoding = THREE.sRGBEncoding;
let externalAudioElement = null;
let currentAudioTrack = 0;
let audioTracks = [];
let isExternalAudio = false;

// DOM elements
const container = document.getElementById('video-container');
const controls = document.getElementById('controls');
const playPauseBtn = document.getElementById('play-pause');
const progressBar = document.getElementById('progress');
const progressContainer = document.getElementById('progress-container');
const timeDisplay = document.getElementById('time');
const volumeSlider = document.getElementById('volume-slider');
const loadingIndicator = document.getElementById('loading');
const dropArea = document.getElementById('drop-area');
const fileSelectBtn = document.getElementById('file-select-btn');

// Create audio track button
const audioTrackBtn = document.createElement('div');
audioTrackBtn.id = 'audio-track-btn';
audioTrackBtn.className = 'control-button tooltip';
audioTrackBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
audioTrackBtn.title = 'Audio Tracks';

// Create audio track menu
const audioTrackMenu = document.createElement('div');
audioTrackMenu.id = 'audio-track-menu';
audioTrackMenu.className = 'control-menu';
audioTrackMenu.style.display = 'none';

// Create load external audio button
const loadAudioBtn = document.createElement('div');
loadAudioBtn.id = 'load-audio-btn';
loadAudioBtn.className = 'control-button tooltip';
loadAudioBtn.innerHTML = '<i class="fas fa-music"></i>';
loadAudioBtn.title = 'Load External Audio';

// Add the new controls to the control bar
controls.appendChild(audioTrackBtn);
controls.appendChild(loadAudioBtn);
container.appendChild(audioTrackMenu);

const speedBtn = document.createElement('div');
speedBtn.id = 'speed-btn';
speedBtn.className = 'control-button tooltip';
speedBtn.innerHTML = '1x';
speedBtn.title = 'Playback Speed';

const fullscreenBtn = document.createElement('div');
fullscreenBtn.id = 'fullscreen-btn';
fullscreenBtn.className = 'control-button tooltip';
fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
fullscreenBtn.title = 'Toggle Fullscreen';

// Add to your DOM elements section
const brightnessIndicator = document.createElement('div');
brightnessIndicator.id = 'brightness-indicator';
brightnessIndicator.className = 'overlay-indicator';
brightnessIndicator.style.display = 'none';
container.appendChild(brightnessIndicator);

const brightnessSlider = document.createElement('div');
brightnessSlider.id = 'brightness-control';
brightnessSlider.className = 'control-group';
brightnessSlider.innerHTML = `
  <i class="fas fa-sun"></i>
  <input type="range" id="brightness-slider" 
         min="0.1" max="2" step="0.1" value="1.0" 
         class="slider" title="Brightness">
`;
controls.appendChild(brightnessSlider);

// Initialize the application
function init() {
  // Create Three.js scene
  scene = new THREE.Scene();
  
  // Create camera
  camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.layers.enable(1);// Enable default layer // Small offset to avoid rendering issues
  // Create camera
  
  
  // Create renderer
renderer = new THREE.WebGLRenderer({
    antialias: true,
    outputEncoding: currentEncoding,  // Changed from sRGBEncoding
    toneMapping: currentToneMapping,      // Set default to no tone mapping
    toneMappingExposure: 1.0,
    pixelFormat: THREE.RGBA_BFLOAT16_Format,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: true,
    preserveDrawingBuffer: true,
    alpha: true,
});
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);
  
  // Add these lines after renderer creation
  renderer.gammaFactor = 1.0; // Adjust gamma for better brightness
  renderer.outputColorSpace = THREE.SRGBColorSpace; // Ensure proper color space
  
  // Create video element
  videoElement = document.createElement('video');
  videoElement.playsInline = true;
  videoElement.loop = true;
  videoElement.crossOrigin = 'anonymous';
  // Add to your init function or where other event listeners are set up
document.getElementById('brightness-slider').addEventListener('input', (e) => {
    brightnessValue = parseFloat(e.target.value);
    updateBrightness();
});
  // Event listeners
  window.addEventListener('resize', onWindowResize);
  container.addEventListener('mousedown', onMouseDown);
  container.addEventListener('mousemove', onMouseMove);
  container.addEventListener('mouseup', onMouseUp);
  container.addEventListener('wheel', onMouseWheel);
  
  // Touch events for mobile
  container.addEventListener('touchstart', onTouchStart);
  container.addEventListener('touchmove', onTouchMove);
  container.addEventListener('touchend', onTouchEnd);
  
  // Video controls
  playPauseBtn.addEventListener('click', togglePlayPause);
  progressContainer.addEventListener('click', seekVideo);
  volumeSlider.addEventListener('input', updateVolume);
  
  // File drop handling
container.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropArea.classList.add('active'); // Show overlay if you want
});

container.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropArea.classList.remove('active');
});

container.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.classList.remove('active');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        loadVideo(e.dataTransfer.files[0].path);
    }
});
  
  fileSelectBtn.addEventListener('click', () => {
    ipcRenderer.send('select-file');
  });
  
  // IPC events
  ipcRenderer.on('video-selected', (event, videoPath) => {
    loadVideo(videoPath);
  });
  
  ipcRenderer.on('reset-camera', () => {
    lon = 0;
    lat = 0;
  });
 ipcRenderer.on('set-encoding', (event, type) => {
    updateEncoding(type);
    // Force renderer update
    renderer.setPixelRatio(window.devicePixelRatio * resolutionScale);
});
  
// When receiving the 'set-mode' message, handle flat mode correctly
ipcRenderer.on('set-mode', (event, mode) => {
  videoMode = mode;
  if (isVideoLoaded) {
    // First, remove existing sphere/plane
    if (sphere) {
      scene.remove(sphere);
      sphere.geometry.dispose();
      sphere.material.dispose();
    }
    
    // Create appropriate mesh based on video mode
    if (mode === 'flat') {
      // Create mesh for flat video
      createVideoMesh();
      
      // Reset camera orientation for flat mode
      lon = -90;
    } else {
      // Create spherical mesh for 360 modes
      createVideoSphere();
      controlsLocked = false;
      updateSphereUV();
      
      // Set appropriate camera orientation
      if (mode === 'stereo-lr') {
        lon = 180; // Center on the left eye
      } else {
        lon = -180;   // Center for mono or stereo-tb
      }
    }
    container.style.cursor = mode === 'flat' ? 'default' : 'grab';
  }
});
  
  // Start animation loop
  animate();

  // Add enhanced controls
  initEnhancedControls();

  // Update document listeners for fullscreen change
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.addEventListener('mozfullscreenchange', handleFullscreenChange);
  document.addEventListener('MSFullscreenChange', handleFullscreenChange);
}

function updatePlayPauseButton() {
  if (isPlaying) {
    playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
  } else {
    playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
  }
}

const ffmpeg = require('fluent-ffmpeg');
// Add this function to handle encoding changes
function updateEncoding(type) {
    // Store current encoding type
    console.log('Updating encoding to:', type);
    
    // Update renderer and texture encoding
    switch (type) {
        case 'Linear':
            renderer.outputEncoding = THREE.LinearEncoding;
            break;
        case 'sRGBEncoding':
            renderer.outputEncoding = THREE.sRGBEncoding;
            break;
        case 'GammaEncoding':
            renderer.outputEncoding = THREE.GammaEncoding;
            break;
        case 'RGBEEncoding':
            renderer.outputEncoding = THREE.RGBEEncoding;
            break;
        case 'LogLuvEncoding':
            renderer.outputEncoding = THREE.LogLuvEncoding;
            break;
        case 'RGBM16Encoding':
            renderer.outputEncoding = THREE.RGBM16Encoding;
            break;
        case 'RGBM7Encoding':
            renderer.outputEncoding = THREE.RGBM7Encoding;
            break;
        case 'RGBDEncoding':
            renderer.outputEncoding = THREE.RGBDEncoding;
            break;
    }
    
    // Force material update
    if (sphere && sphere.material) {
        sphere.material.needsUpdate = true;
    }
}

// Add the IPC listener

function updateToneMapping(type) {
    switch (type) {
        case 'NoToneMapping':
            renderer.toneMapping = THREE.NoToneMapping;
            break;
        case 'ACESFilmic':
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            break;
        case 'Linear':
            renderer.toneMapping = THREE.LinearToneMapping;
            break;
        case 'Reinhard':
            renderer.toneMapping = THREE.ReinhardToneMapping;
            break;
        case 'Cineon':
            renderer.toneMapping = THREE.CineonToneMapping;
            break;
    }
    currentToneMapping = renderer.toneMapping;
    renderer.toneMappingExposure = 1.0;
}

function loadVideo(videoPath) {
  const validExtensions = ['.mp4', '.webm', '.mkv', '.mov'];
  const ext = path.extname(videoPath).toLowerCase();
  if (!validExtensions.includes(ext)) {
    alert('Unsupported video format. Please use MP4, WebM, or MKV.');
    showLoading(false);
    showDropArea(true);
    return;
  }
  showLoading(true);
  
  if (videoElement.src) {
    videoElement.pause();
    videoElement.removeAttribute('src');
  }
  
  if (videoTexture) {
    videoTexture.dispose();
  }
  
  if (sphere) {
    scene.remove(sphere);
    sphere.geometry.dispose();
    sphere.material.dispose();
  }
  
  videoElement.src = videoPath.startsWith('http')
    ? videoPath
    : `file://${encodeURI(videoPath.replace(/\\/g, '/'))}`;
  console.log('Video source set to:', videoElement.src);

  videoElement.addEventListener('timeupdate', updateProgressBar);

  videoElement.load();
  videoElement.addEventListener('loadeddata', () => {
    setupAudioTracks();
    setupAudioEnhancement();
  });
  
  videoElement.onloadedmetadata = () => {
    console.log('Video metadata loaded');
    
    if (videoMode === 'flat') {
      createVideoMesh();
    } else {
      createVideoSphere();
    }

    const playPromise = videoElement.play().catch(error => {
      console.error('Playback failed:', error);
      showLoading(false);
      showDropArea(true);
      alert('Error playing video. The format may not be supported.');
    });

    if (playPromise !== undefined) {
      playPromise.then(() => {
        showLoading(false);
        showDropArea(false);
        isPlaying = true;
        updatePlayPauseButton();
        isVideoLoaded = true;
        
        if (videoMode === 'stereo-lr') {
          lon = 0;
        } else if (videoMode === 'flat') {
          lon = 0;
          lat = 0;
          if (sphere) camera.lookAt(sphere.position);
        } else {
          lon = 0;
        }
      }).catch(error => {
        console.error('Playback failed:', error);
        showLoading(false);
        showDropArea(true);
      });
    }
  };

  videoElement.onerror = () => {
    console.error('Video error:', videoElement.error);
    showLoading(false);
    showDropArea(true);
  };
}


function createVideoSphere() {
  videoTexture = createVideoTexture();
  
  const geometry = new THREE.SphereGeometry(1000, 500, 300);
  geometry.scale(-1, 1, 1);

  // Create material with enhanced brightness
  const material = new THREE.MeshBasicMaterial({ 
      map: videoTexture,
      color: 0xffffff,  // White color to maintain brightness
  });
  
  sphere = new THREE.Mesh(geometry, material);
  scene.add(sphere);
  updateSphereUV();
}
function createVideoMesh() {
  if (videoMode === 'flat') {
    if (sphere) {
      scene.remove(sphere);
      sphere.geometry.dispose();
      sphere.material.dispose();
    }
    if (videoMode === 'flat') {
    container.style.cursor = 'default';
  } else {
    container.style.cursor = 'grab';
  }

    if (!videoTexture) {
      videoTexture = createVideoTexture();
      
    }
    // Calculate plane size to maintain video aspect ratio
    const distance = 500; // Distance for better view
    const videoAspect = videoElement.videoWidth / videoElement.videoHeight;
    
    // Use a different approach for calculating the plane size
    // to fill the window properly in windowed mode
    let planeHeight = distance * Math.tan(camera.fov * Math.PI / 180 / 2) * 2;
    let planeWidth = planeHeight * videoAspect;
    
    // Adjust based on window aspect ratio
    const windowAspect = window.innerWidth / window.innerHeight;
    
    if (videoAspect > windowAspect) {
      // Video is wider than window - use window aspect to determine width
      planeWidth = distance * Math.tan(camera.fov * Math.PI / 180 / 2) * 2 * windowAspect;
      planeHeight = planeWidth / videoAspect;
    }

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const material = new THREE.MeshBasicMaterial({ 
      map: videoTexture,
      side: THREE.DoubleSide 
    });
    
    sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(0, 0, -distance);
    
    scene.add(sphere);
    camera.lookAt(sphere.position);
    
    // Lock controls
    controlsLocked = true;
    lon = 0;
    lat = 0;
  } else {
    // For 360 video: use a sphere as before
    videoTexture = createVideoTexture();

    
    const geometry = new THREE.SphereGeometry(1000, 300, 150);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ map: videoTexture });
    sphere = new THREE.Mesh(geometry, material);
    
    // Store original UVs if not already stored
    if (!geometry.userData.originalUVs) {
      geometry.userData.originalUVs = [];
      for (let i = 0; i < geometry.attributes.uv.count; i++) {
        geometry.userData.originalUVs.push([
          geometry.attributes.uv.getX(i),
          geometry.attributes.uv.getY(i)
        ]);
      }
    }
    
    // Unlock controls for 360 mode
    controlsLocked = false;
    scene.add(sphere);
    
    // Update UVs based on current video mode
    updateSphereUV();
  }
}
// Animation loop
// Event handlers
function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  renderer.setSize(width, height);
  
  // If in flat mode, update video plane size
  if (videoMode === 'flat' && sphere) {
    createVideoMesh(); // Recreate mesh with new dimensions
  }
}
function updateAudioPosition() {
  if (spatialAudio && !controlsLocked) {
    // Convert spherical coordinates to Cartesian
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);
    
    // Update audio position opposite to camera view
    spatialAudio.setPosition(-x, -y, -z);
  }
}

function onMouseDown(event) {
  if (controlsLocked || videoMode === 'flat') return;
  event.preventDefault();
  mouseDown = true;
  mouseX = event.clientX;
  mouseY = event.clientY;
  container.style.cursor = 'grabbing';
}

function onMouseUp() {
  mouseDown = false;
  container.style.cursor = 'grab'; // Change to grab when not dragging
}

// Optional: Set default cursor to grab when hovering over the container
container.style.cursor = 'grab';

function onMouseMove(event) {
  if (controlsLocked) return;
  if (!mouseDown) return;

  const deltaX = event.clientX - mouseX;
  const deltaY = event.clientY - mouseY;

  mouseX = event.clientX;
  mouseY = event.clientY;

  targetLon += deltaX * 0.2;
  targetLat -= deltaY * 0.2;
}

function onMouseWheel(event) {
  if (videoMode === 'flat') {
    // In flat mode, control audio volume
    const volumeChange = event.deltaY > 0 ? -0.05 : 0.05;
    videoElement.volume = Math.max(0, Math.min(1, videoElement.volume + volumeChange));
    volumeSlider.value = videoElement.volume;
    return;
  }

  if (controlsLocked) return;
  if (event.ctrlKey) {
    // Zoom with Ctrl + wheel
    const fov = camera.fov + event.deltaY * 0.05;
    camera.fov = THREE.MathUtils.clamp(fov, 30, 150);
    camera.updateProjectionMatrix();
  } else if (event.shiftKey && isVideoLoaded) {
    // Seek with Shift + wheel
    videoElement.currentTime = Math.max(0, 
      Math.min(videoElement.duration, 
        videoElement.currentTime + (event.deltaY > 0 ? 5 : -5)));
  } else {
    // Regular zoom behavior
    const fov = camera.fov + event.deltaY * 0.05;
    camera.fov = THREE.MathUtils.clamp(fov, 30, 120);
    camera.updateProjectionMatrix();
  }
}
function onTouchStart(event) {
  if (controlsLocked) return;
  if (event.touches.length === 1) {
    event.preventDefault();
    mouseDown = true;
    mouseX = event.touches[0].pageX;
    mouseY = event.touches[0].pageY;
  }
}

function onTouchMove(event) {
  if (controlsLocked) return;
  if (mouseDown && event.touches.length === 1) {
    event.preventDefault();

    const deltaX = event.touches[0].pageX - mouseX;
    const deltaY = event.touches[0].pageY - mouseY;

    mouseX = event.touches[0].pageX;
    mouseY = event.touches[0].pageY;

    targetLon += deltaX * 0.2;
    targetLat -= deltaY * 0.2;
  }
}

function onTouchEnd() {
  mouseDown = false;
}

// Video control functions
function togglePlayPause() {
  if (isVideoLoaded) {
    if (isPlaying) {
      videoElement.pause();
      if (externalAudioElement) {
        externalAudioElement.pause();
      }
    } else {
      videoElement.play();
      if (externalAudioElement && audioTracks[currentAudioTrack].isExternal) {
        externalAudioElement.play();
      }
    }
    
    isPlaying = !isPlaying;
    updatePlayPauseButton();
  }
}

function updatePlayPauseButton() {
  playPauseBtn.classList.toggle('playing', isPlaying);
}

function updateProgressBar() {
  const currentTime = videoElement.currentTime;
  const duration = videoElement.duration;
  
  if (duration > 0) {
    const percentage = (currentTime / duration) * 100;
    progressBar.style.width = `${percentage}%`;
    
    const currentMinutes = Math.floor(currentTime / 60);
    const currentSeconds = Math.floor(currentTime % 60);
    const totalMinutes = Math.floor(duration / 60);
    const totalSeconds = Math.floor(duration % 60);
    
    timeDisplay.textContent = `${padTime(currentMinutes)}:${padTime(currentSeconds)} / ${padTime(totalMinutes)}:${padTime(totalSeconds)}`;
  }
}

function seekVideo(event) {
  if (!isVideoLoaded) return;
  
  const rect = progressContainer.getBoundingClientRect();
  const percentage = (event.clientX - rect.left) / rect.width;
  videoElement.currentTime = percentage * videoElement.duration;
}

function updateVolume() {
  videoElement.volume = volumeSlider.value;
}

function padTime(time) {
  return time.toString().padStart(2, '0');
}

// UI helper functions
function showLoading(show) {
  loadingIndicator.style.display = show ? 'flex' : 'none';
}

function showControls(show) {
  if (show) {
    controls.style.display = 'flex';
  }
  // Remove the opacity setting - let CSS handle it
}

function showDropArea(show) {
  dropArea.style.display = show ? 'flex' : 'none';
}

// Enhanced controls setup
function initEnhancedControls() {
  // Speed button
  speedBtn.addEventListener('click', togglePlaybackSpeed);
  controls.appendChild(speedBtn);

  // Fullscreen button
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  controls.appendChild(fullscreenBtn);

  // Enhanced keyboard controls
  document.addEventListener('keydown', handleKeyboardControls);

  // Double-click to toggle fullscreen
  container.addEventListener('dblclick', toggleFullscreen);

  // Remove any .controls-hidden class usage
  controls.style.pointerEvents = 'auto'; // Ensure controls are clickable
}
// Toggle fullscreen
function toggleFullscreen() {
  // Send IPC message to main process to handle fullscreen
  ipcRenderer.send('toggle-fullscreen');
}


// Toggle playback speed
function togglePlaybackSpeed() {
  const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const currentIndex = speeds.indexOf(currentSpeed);
  const nextIndex = (currentIndex + 1) % speeds.length;
  currentSpeed = speeds[nextIndex];
  videoElement.playbackRate = currentSpeed;
  speedBtn.innerHTML = `${currentSpeed}x`;
}

// Enhanced keyboard controls
function handleKeyboardControls(e) {
    if (e.key === ' ') {
        e.preventDefault();
    }
    
    switch(e.key) {
        case ' ':
        case 'Space':
            if (isVideoLoaded) {
                togglePlayPause();
            }
            break;
        case 'f':
            toggleFullscreen();
            break;
        case 'ArrowRight':
            if (isVideoLoaded) videoElement.currentTime += 10;
            break;
        case 'ArrowLeft':
            if (isVideoLoaded) videoElement.currentTime -= 10;
            break;
        case 'ArrowUp':
            if (isVideoLoaded && videoElement.volume < 1.0) 
                videoElement.volume = Math.min(1, videoElement.volume + 0.1);
            volumeSlider.value = videoElement.volume;
            break;
        case 'ArrowDown':
            if (isVideoLoaded && videoElement.volume > 0) 
                videoElement.volume = Math.max(0, videoElement.volume - 0.1);
            volumeSlider.value = videoElement.volume;
            break;
        case 's':
            togglePlaybackSpeed();
            break;
        case 'm':
            videoElement.muted = !videoElement.muted;
            break;
        case 'r':
            lon = 0;
            lat = 0;
            break;
        case 'w':
            if (e.ctrlKey && videoMode === 'flat') {
                const widths = [0, 0.5, 1.0, 1.5];
                currentWidth = (currentWidth + 1) % widths.length;
                window.adjustStereoWidth(widths[currentWidth]);
            }
            break;
        case 'b':
            if (e.shiftKey) {
                renderer.toneMappingExposure = Math.max(0.5, renderer.toneMappingExposure - 0.1);
            } else {
                renderer.toneMappingExposure = Math.min(2.0, renderer.toneMappingExposure + 0.1);
            }
            break;
        case 'a':
            // Cycle through available audio tracks
            if (audioTracks.length > 0) {
                const nextTrack = (currentAudioTrack + 1) % audioTracks.length;
                selectAudioTrack(nextTrack);
            }
            break;
    }
}


// Handle fullscreen change
function handleFullscreenChange() {
  isFullscreen = !!document.fullscreenElement || 
                 !!document.webkitFullscreenElement || 
                 !!document.mozFullScreenElement ||
                 !!document.msFullscreenElement;
  fullscreenBtn.innerHTML = isFullscreen ? 
    '<i class="fas fa-compress"></i>' : 
    '<i class="fas fa-expand"></i>';

  // Toggle fullscreen-active class on body
  if (isFullscreen) {
    document.body.classList.add('fullscreen-active');
  } else {
    document.body.classList.remove('fullscreen-active');
  }
}

// --- Update your init function to call the new controls and listeners ---



// Update UV mapping based on video mode
function updateSphereUV() {
  if (!sphere || videoMode === 'flat') return;

  const geometry = sphere.geometry;
  const uv = geometry.attributes.uv;
  const videoWidth = videoElement.videoWidth || 1920;
  const videoHeight = videoElement.videoHeight || 1080;
  const aspectRatio = videoWidth / videoHeight;

  // Restore original UVs
  if (geometry.userData.originalUVs) {
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i,
        geometry.userData.originalUVs[i][0],
        geometry.userData.originalUVs[i][1]
      );
    }
  }

  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i);
    let v = uv.getY(i);

    switch (videoMode) {
      case 'mono':
        // Adjust for aspect ratio if not 2:1
        if (Math.abs(aspectRatio - 2) > 0.1) {
          console.warn(`Video aspect ratio (${aspectRatio.toFixed(2)}) is not 2:1, adjusting UVs`);
          u = u * (aspectRatio > 2 ? 2 / aspectRatio : 1);
          v = v * (aspectRatio < 2 ? aspectRatio / 2 : 1);
        }

        // Stretch V toward poles (opposite of compression)
        const stretchFactor = 1; // > 1 to stretch toward poles (1.0 = no stretch, 1.2 = moderate stretch)
        v = 0.5 + (v - 0.5) / stretchFactor; // Expand V near poles
        break;
      case 'stereo-lr':
        u = u * 0.5 + (camera.layers.mask === 1 ? 0 : 0.5);
        break;
      case 'stereo-tb':
        v = v * 0.5 + (camera.layers.mask === 1 ? 0 : 0.5);
        break;
    }

    uv.setXY(i, u, v);
  }

  uv.needsUpdate = true;
}
// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Easing factor (0.1 = slow, 1 = instant)
  const ease = 0.1;
  lon += (targetLon - lon) * ease;
  lat += (targetLat - lat) * ease;

  // Only update camera orientation if not in flat mode
  if (!controlsLocked) {
    // Limit vertical movement more naturally
    lat = Math.max(-85, Math.min(85, lat));
    phi = THREE.MathUtils.degToRad(90 - lat);
    theta = THREE.MathUtils.degToRad(lon);

    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);

    camera.lookAt(new THREE.Vector3(x, y, z));
  } else if (videoMode === 'flat' && sphere) {
    // For flat mode, ensure camera is always looking at the center of the plane
    camera.lookAt(sphere.position);
  }

  if (videoTexture) {
    videoTexture.needsUpdate = true;
    updateAudioPosition();
  }

  // Set the renderer pixel ratio based on resolution scale
  renderer.setPixelRatio(window.devicePixelRatio * resolutionScale);
  renderer.render(scene, camera);

  // Sync external audio if present
  if (isExternalAudio && externalAudioElement) {
    if (Math.abs(externalAudioElement.currentTime - videoElement.currentTime) > 0.1) {
      externalAudioElement.currentTime = videoElement.currentTime;
    }
  }
}

// Event handlers
function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  renderer.setSize(width, height);
  
  // If in flat mode, update video plane size
  if (videoMode === 'flat' && sphere) {
    createVideoMesh(); // Recreate mesh with new dimensions
  }
}

function onMouseMove(event) {
  if (controlsLocked) return;
  if (!mouseDown) return;

  const deltaX = event.clientX - mouseX;
  const deltaY = event.clientY - mouseY;

  mouseX = event.clientX;
  mouseY = event.clientY;

  targetLon += deltaX * 0.2;
  targetLat -= deltaY * 0.2;
}

function onMouseUp() {
  mouseDown = false;
  container.style.cursor = videoMode === 'flat' ? 'default' : 'grab';
}


function onMouseWheel(event) {
  if (controlsLocked) return;
  if (event.ctrlKey) {
    // Zoom with Ctrl + wheel
    const fov = camera.fov + event.deltaY * 0.05;
    camera.fov = THREE.MathUtils.clamp(fov, 30, 150);
    camera.updateProjectionMatrix();
  } else if (event.shiftKey && isVideoLoaded) {
    // Seek with Shift + wheel
    videoElement.currentTime = Math.max(0, 
      Math.min(videoElement.duration, 
        videoElement.currentTime + (event.deltaY > 0 ? 5 : -5)));
  } else {
    // Regular zoom behavior
    const fov = camera.fov + event.deltaY * 0.05;
    camera.fov = THREE.MathUtils.clamp(fov, 30, 120);
    camera.updateProjectionMatrix();
  }
}
function onTouchStart(event) {
  if (controlsLocked) return;
  if (event.touches.length === 1) {
    event.preventDefault();
    mouseDown = true;
    mouseX = event.touches[0].pageX;
    mouseY = event.touches[0].pageY;
  }
}

function onTouchMove(event) {
  if (controlsLocked) return;
  if (mouseDown && event.touches.length === 1) {
    event.preventDefault();

    const deltaX = event.touches[0].pageX - mouseX;
    const deltaY = event.touches[0].pageY - mouseY;

    mouseX = event.touches[0].pageX;
    mouseY = event.touches[0].pageY;

    targetLon += deltaX * 0.2;
    targetLat -= deltaY * 0.2;
  }
}

function onTouchEnd() {
  mouseDown = false;
}

// Video control functions
function togglePlayPause() {
  if (isVideoLoaded) {
    if (isPlaying) {
      videoElement.pause();
      if (externalAudioElement) {
        externalAudioElement.pause();
      }
    } else {
      videoElement.play();
      if (externalAudioElement && audioTracks[currentAudioTrack].isExternal) {
        externalAudioElement.play();
      }
    }
    
    isPlaying = !isPlaying;
    updatePlayPauseButton();
  }
}

function updatePlayPauseButton() {
  playPauseBtn.classList.toggle('playing', isPlaying);
}



function seekVideo(event) {
  if (!isVideoLoaded) return;
  
  const rect = progressContainer.getBoundingClientRect();
  const percentage = (event.clientX - rect.left) / rect.width;
  videoElement.currentTime = percentage * videoElement.duration;
}

function updateVolume() {
  videoElement.volume = volumeSlider.value;
}

function padTime(time) {
  return time.toString().padStart(2, '0');
}

// UI helper functions
function showLoading(show) {
  loadingIndicator.style.display = show ? 'flex' : 'none';
}

function showControls(show) {
  if (show) {
    controls.style.display = 'flex';
  }
  // Remove the opacity setting - let CSS handle it
}

function showDropArea(show) {
  dropArea.style.display = show ? 'flex' : 'none';
}

// Enhanced controls setup
function initEnhancedControls() {
  // Speed button
  speedBtn.addEventListener('click', togglePlaybackSpeed);
  controls.appendChild(speedBtn);

  // Fullscreen button
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  controls.appendChild(fullscreenBtn);

  // Enhanced keyboard controls
  document.addEventListener('keydown', handleKeyboardControls);

  // Double-click to toggle fullscreen
  container.addEventListener('dblclick', toggleFullscreen);

  // Remove any .controls-hidden class usage
  controls.style.pointerEvents = 'auto'; // Ensure controls are clickable
}

// Toggle fullscreen
function toggleFullscreen() {
  // Send IPC message to main process to handle fullscreen
  ipcRenderer.send('toggle-fullscreen');
}

// Toggle playback speed
function togglePlaybackSpeed() {
  const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const currentIndex = speeds.indexOf(currentSpeed);
  const nextIndex = (currentIndex + 1) % speeds.length;
  currentSpeed = speeds[nextIndex];
  videoElement.playbackRate = currentSpeed;
  speedBtn.innerHTML = `${currentSpeed}x`;
}

// Enhanced keyboard controls
function handleKeyboardControls(e) {
    if (e.key === ' ') {
        e.preventDefault();
    }
    
    switch(e.key) {
        case ' ':
        case 'Space':
            if (isVideoLoaded) {
                togglePlayPause();
            }
            break;
        case 'f':
            toggleFullscreen();
            break;
        case 'ArrowRight':
            if (isVideoLoaded) videoElement.currentTime += 10;
            break;
        case 'ArrowLeft':
            if (isVideoLoaded) videoElement.currentTime -= 10;
            break;
        case 'ArrowUp':
            if (isVideoLoaded && videoElement.volume < 1.0) 
                videoElement.volume = Math.min(1, videoElement.volume + 0.1);
            volumeSlider.value = videoElement.volume;
            break;
        case 'ArrowDown':
            if (isVideoLoaded && videoElement.volume > 0) 
                videoElement.volume = Math.max(0, videoElement.volume - 0.1);
            volumeSlider.value = videoElement.volume;
            break;
        case 's':
            togglePlaybackSpeed();
            break;
        case 'm':
            videoElement.muted = !videoElement.muted;
            break;
        case 'r':
            lon = 0;
            lat = 0;
            break;
        case 'w':
            if (e.ctrlKey && videoMode === 'flat') {
                const widths = [0, 0.5, 1.0, 1.5];
                currentWidth = (currentWidth + 1) % widths.length;
                window.adjustStereoWidth(widths[currentWidth]);
            }
            break;
        case 'b':
            if (e.shiftKey) {
                renderer.toneMappingExposure = Math.max(0.5, renderer.toneMappingExposure - 0.1);
            } else {
                renderer.toneMappingExposure = Math.min(2.0, renderer.toneMappingExposure + 0.1);
            }
            break;
        case 'a':
            // Cycle through available audio tracks
            if (audioTracks.length > 0) {
                const nextTrack = (currentAudioTrack + 1) % audioTracks.length;
                selectAudioTrack(nextTrack);
            }
            break;
    }
}


// Handle fullscreen change
function handleFullscreenChange() {
  isFullscreen = !!document.fullscreenElement || 
                 !!document.webkitFullscreenElement || 
                 !!document.mozFullScreenElement ||
                 !!document.msFullscreenElement;
  fullscreenBtn.innerHTML = isFullscreen ? 
    '<i class="fas fa-compress"></i>' : 
    '<i class="fas fa-expand"></i>';

  // Toggle fullscreen-active class on body
  if (isFullscreen) {
    document.body.classList.add('fullscreen-active');
  } else {
    document.body.classList.remove('fullscreen-active');
  }
}

// Add this new function
function setupAudioEnhancement() {
  if (!audioContext) {
    // Create high-quality audio context with maximum sample rate
    audioContext = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 96000});
    
    // Create audio source from video element
    audioSource = audioContext.createMediaElementSource(videoElement);
    
    // Create analyser node
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // Higher FFT size for better frequency resolution
    
    // Create optimized dynamics compressor for clarity
    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24;  // Less aggressive compression
    compressor.knee.value = 30;        // Smoother transition
    compressor.ratio.value = 4;        // More natural sound
    compressor.attack.value = 0.003;   // Fast but not instantaneous
    compressor.release.value = 0.25;   // Natural decay
    
    // Create stereo panner for flat videos
    const stereoPanner = audioContext.createStereoPanner();
    
    // Create enhanced spatial audio processor for 360 videos
    spatialAudio = audioContext.createPanner();
    spatialAudio.panningModel = 'HRTF';
    spatialAudio.distanceModel = 'inverse';
    spatialAudio.refDistance = 1;
    spatialAudio.maxDistance = 10000;
    spatialAudio.rolloffFactor = 1;
    spatialAudio.coneInnerAngle = 360;
    spatialAudio.coneOuterAngle = 360;
    spatialAudio.coneOuterGain = 0;
    
    // Create limiter to prevent clipping
    const limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = -1.0;  // Only limit peaks approaching 0dB
    limiter.knee.value = 0;          // Hard knee for true limiting
    limiter.ratio.value = 20;        // High ratio for brick wall limiting
    limiter.attack.value = 0.001;    // Very fast attack
    limiter.release.value = 0.1;     // Quick release
    
    // Create enhanced 10-band equalizer
    const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    equalizer = frequencies.map(freq => {
      const filter = audioContext.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.4; // Sharper Q for more precise adjustments
      filter.gain.value = 0;
      return filter;
    });
    
    // Apply optimized EQ settings for maximum clarity
    equalizer.find(eq => eq.frequency.value === 32).gain.value = 0.5;    // Subtle sub-bass
    equalizer.find(eq => eq.frequency.value === 64).gain.value = 1;      // Clean bass
    equalizer.find(eq => eq.frequency.value === 125).gain.value = 2;     // Enhanced bass
    equalizer.find(eq => eq.frequency.value === 250).gain.value = -1;    // Reduce mud
    equalizer.find(eq => eq.frequency.value === 500).gain.value = 0;     // Keep mids neutral
    equalizer.find(eq => eq.frequency.value === 1000).gain.value = 0.5;  // Slight vocal boost
    equalizer.find(eq => eq.frequency.value === 2000).gain.value = 2;    // Enhanced vocal clarity
    equalizer.find(eq => eq.frequency.value === 4000).gain.value = 1.5;  // Presence
    equalizer.find(eq => eq.frequency.value === 8000).gain.value = 3;    // Air and brilliance
    equalizer.find(eq => eq.frequency.value === 16000).gain.value = 2;   // Extended highs
    
    // Add stereo width enhancement
    const splitter = audioContext.createChannelSplitter(2);
    const merger = audioContext.createChannelMerger(2);
    const leftGain = audioContext.createGain();
    const rightGain = audioContext.createGain();
    
    // Set initial enhanced stereo width
    leftGain.gain.value = 1.5;  // Enhanced stereo width
    rightGain.gain.value = 1.5;  // Enhanced stereo width
    
    // Function to update audio routing based on video mode
    function updateAudioRouting() {
      // Disconnect all existing connections
      audioSource.disconnect();
      
      if (equalizer[0].numberOfInputs > 0) {
        equalizer[0].disconnect();
        equalizer.forEach(eq => eq.disconnect());
        compressor.disconnect();
        stereoPanner.disconnect();
        spatialAudio.disconnect();
        splitter.disconnect();
        leftGain.disconnect();
        rightGain.disconnect();
        merger.disconnect();
        limiter.disconnect();
      }
      
      // Connect equalizer filters in series
      audioSource.connect(equalizer[0]);
      for (let i = 0; i < equalizer.length - 1; i++) {
        equalizer[i].connect(equalizer[i + 1]);
      }
      
      // Complete the audio chain based on video mode
      if (videoMode === 'flat') {
        // Flat video: EQ -> Compressor -> Stereo Enhancement -> Limiter -> Output
        equalizer[equalizer.length - 1].connect(compressor);
        compressor.connect(splitter);
        
        // Apply stereo width enhancement
        splitter.connect(leftGain, 0);
        splitter.connect(rightGain, 1);
        leftGain.connect(merger, 0, 0);
        rightGain.connect(merger, 0, 1);
        
        merger.connect(limiter);
        limiter.connect(audioContext.destination);
      } else {
        // 360 video: EQ -> Compressor -> Spatial Audio -> Limiter -> Output
        equalizer[equalizer.length - 1].connect(compressor);
        compressor.connect(spatialAudio);
        spatialAudio.connect(limiter);
        limiter.connect(audioContext.destination);
      }
    }
    
    // Initial routing setup
    updateAudioRouting();
    
    // Listen for video mode changes
    ipcRenderer.on('set-mode', (event, mode) => {
      videoMode = mode;
      updateAudioRouting();
    });
    ipcRenderer.on('set-tone-mapping', (event, type) => {
    updateToneMapping(type);
});
    // Enhanced stereo width control function
    window.adjustStereoWidth = function(width) {
      const gain = Math.min(1 + width, 2);
      leftGain.gain.value = gain;
      rightGain.gain.value = gain;
    };
    
    // Set stereo width to enhanced value
    window.adjustStereoWidth(1.5);
    
    // Add noise reduction for maximum clarity (simple implementation)
    const noiseReduction = audioContext.createBiquadFilter();
    noiseReduction.type = 'highpass';
    noiseReduction.frequency.value = 30; // Cut extreme low frequencies that are often just noise
    
    // Insert noise reduction at the beginning of the chain
    audioSource.disconnect();
    audioSource.connect(noiseReduction);
    noiseReduction.connect(equalizer[0]);
    
    console.log('High-quality audio enhancement activated');
  }
}
// In createVideoTexture():
function createVideoTexture() {
    const texture = new THREE.VideoTexture(videoElement);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.HalfFloatType; 
    texture.encoding = currentEncoding;
    texture.colorSpace = THREE.SRGBColorSpace;

    texture.generateMipmaps = false;
    return texture;
}

// Update the updateBrightness function
function updateBrightness() {
    if (sphere && sphere.material) {
        sphere.material.color.setRGB(brightnessValue, brightnessValue, brightnessValue);
        
        // Update the brightness slider value
        document.getElementById('brightness-slider').value = brightnessValue;
        
        // Update brightness indicator
        const brightnessIndicator = document.getElementById('brightness-indicator');
        brightnessIndicator.textContent = `Brightness: ${Math.round(brightnessValue * 100)}%`;
        brightnessIndicator.classList.add('visible');
        
        // Hide indicator after delay
        clearTimeout(window.brightnessTimeout);
        window.brightnessTimeout = setTimeout(() => {
            brightnessIndicator.classList.remove('visible');
        }, 1500);
    }
}

// Add these functions after setupAudioEnhancement()

function setupAudioTracks() {
    // Clear existing audio tracks
    audioTracks = [];
    audioTrackMenu.innerHTML = '';
    
    if (videoElement.audioTracks) {
        // Get audio tracks from video
        Array.from(videoElement.audioTracks).forEach((track, index) => {
            audioTracks.push({
                index: index,
                label: track.label || `Audio Track ${index + 1}`,
                language: track.language || 'unknown',
                isExternal: false
            });
        });
    }
    
    // Update the audio track menu
    updateAudioTrackMenu();
    
    // Show/hide audio track button based on available tracks
    audioTrackBtn.style.display = audioTracks.length > 1 ? 'block' : 'none';
}

function updateAudioTrackMenu() {
    audioTrackMenu.innerHTML = '';
    
    // Add menu items for each audio track
    audioTracks.forEach((track, index) => {
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item' + (index === currentAudioTrack ? ' active' : '');
        menuItem.textContent = `${track.label} (${track.language})`;
        menuItem.addEventListener('click', () => {
            selectAudioTrack(index);
            audioTrackMenu.style.display = 'none';
        });
        audioTrackMenu.appendChild(menuItem);
    });
    
    // Add option to load external audio
    const loadExternalItem = document.createElement('div');
    loadExternalItem.className = 'menu-item';
    loadExternalItem.textContent = 'Load External Audio...';
    loadExternalItem.addEventListener('click', () => {
        loadExternalAudio();
        audioTrackMenu.style.display = 'none';
    });
    audioTrackMenu.appendChild(loadExternalItem);
}

function selectAudioTrack(index) {
    if (index >= 0 && index < audioTracks.length) {
        currentAudioTrack = index;
        
        if (videoElement.audioTracks) {
            // Disable all audio tracks first
            Array.from(videoElement.audioTracks).forEach(track => {
                track.enabled = false;
            });
            
            // Enable selected track if it's not external
            if (!audioTracks[index].isExternal) {
                videoElement.audioTracks[index].enabled = true;
            }
        }
        
        // Handle external audio
        if (audioTracks[index].isExternal) {
            if (externalAudioElement) {
                externalAudioElement.currentTime = videoElement.currentTime;
                externalAudioElement.play();
                videoElement.muted = true;
            }
        } else {
            if (externalAudioElement) {
                externalAudioElement.pause();
            }
            videoElement.muted = false;
        }
        
        updateAudioTrackMenu();
    }
}

function loadExternalAudio() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const audioUrl = URL.createObjectURL(file);
            
            // Create new audio element if it doesn't exist
            if (!externalAudioElement) {
                externalAudioElement = new Audio();
                externalAudioElement.addEventListener('timeupdate', () => {
                    // Keep external audio synced with video
                    if (Math.abs(externalAudioElement.currentTime - videoElement.currentTime) > 0.1) {
                        externalAudioElement.currentTime = videoElement.currentTime;
                    }
                });
            }
            
            externalAudioElement.src = audioUrl;
            externalAudioElement.load();
            
            // Add external audio track to tracks list
            const trackIndex = audioTracks.length;
            audioTracks.push({
                index: trackIndex,
                label: file.name,
                language: 'external',
                isExternal: true
            });
            
            // Update menu and select new track
            updateAudioTrackMenu();
            selectAudioTrack(trackIndex);
            
            // Show audio track button
            audioTrackBtn.style.display = 'block';
        }
    };
    
    input.click();
}

// Add event listeners for the new buttons
audioTrackBtn.addEventListener('click', () => {
    audioTrackMenu.style.display = audioTrackMenu.style.display === 'none' ? 'block' : 'none';
});

loadAudioBtn.addEventListener('click', loadExternalAudio);

window.addEventListener('DOMContentLoaded', init);
