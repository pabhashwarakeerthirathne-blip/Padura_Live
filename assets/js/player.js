/**
 * PADURA LIVE - CUSTOM YOUTUBE IFRAME LIVE PLAYER CONTROLLER
 * Integrates YouTube IFrame Player API with custom controls,
 * DVR timeline management, speed selection, volume, and fullscreen.
 */

class PaduraPlayer {
  constructor(options = {}) {
    this.mountId = options.mountId || "youtube-player-mount";
    this.wrapperId = options.wrapperId || "video-player-wrapper";
    this.videoId = options.videoId || null;
    this.title = options.title || "Padura Live Stream";
    this.broadcastId = options.broadcastId || null;
    this.onStateChangeCallback = options.onStateChange || null;

    this.ytPlayer = null;
    this.isReady = false;
    this.isPlaying = false;
    this.isMuted = false;
    this.volume = 100;
    this.currentSpeed = 1;
    this.dvrAvailable = false;
    this.duration = 0;
    this.currentTime = 0;
    this.timelineInterval = null;
    this.controlsFadeTimer = null;

    this.init();
  }

  /**
   * Load YouTube API and initialize player
   */
  init() {
    this.bindDomElements();
    this.loadYouTubeIframeAPI();
  }

  bindDomElements() {
    this.wrapper = document.getElementById(this.wrapperId);
    this.playBtn = document.getElementById("player-play-btn");
    this.centerPlayBtn = document.getElementById("center-play-overlay");
    this.playIcon = document.getElementById("play-icon");
    this.pauseIcon = document.getElementById("pause-icon");
    this.timelineWrapper = document.getElementById("player-timeline-wrapper");
    this.playedBar = document.getElementById("player-played-bar");
    this.bufferBar = document.getElementById("player-buffer-bar");
    this.seekerHandle = document.getElementById("player-seeker-handle");
    this.liveSyncBtn = document.getElementById("live-sync-btn");
    this.seekBackBtn = document.getElementById("seek-back-btn");
    this.seekFwdBtn = document.getElementById("seek-fwd-btn");
    this.volumeBtn = document.getElementById("player-volume-btn");
    this.volumeSlider = document.getElementById("player-volume-slider");
    this.timeDisplay = document.getElementById("player-time-display");
    this.speedBtn = document.getElementById("player-speed-btn");
    this.speedMenu = document.getElementById("player-speed-menu");
    this.speedDropdown = document.getElementById("speed-dropdown");
    this.fullscreenBtn = document.getElementById("player-fullscreen-btn");
    this.loader = document.getElementById("player-loader");
    this.messageOverlay = document.getElementById("player-message-overlay");
    this.titleDisplay = document.getElementById("player-stream-title");

    if (this.titleDisplay) {
      this.titleDisplay.textContent = this.title;
    }

    this.setupEventListeners();
  }

  loadYouTubeIframeAPI() {
    if (window.YT && window.YT.Player) {
      this.createPlayer();
    } else {
      // Check if tag already exists
      let tag = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!tag) {
        tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }

      // Store callback
      const existingCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (existingCallback) existingCallback();
        this.createPlayer();
      };
    }
  }

  createPlayer() {
    if (!this.videoId) {
      this.showOverlayMessage("No Stream Available", "No broadcast video has been assigned to this event.");
      return;
    }

    // Hide any previous overlay
    this.hideOverlayMessage();

    this.ytPlayer = new window.YT.Player(this.mountId, {
      videoId: this.videoId,
      playerVars: {
        autoplay: 1,
        controls: 0,          // Disable default YouTube controls
        disablekb: 1,         // Disable default keyboard shortcuts
        enablejsapi: 1,       // Enable JS API controls
        fs: 0,                // Disable default fullscreen button
        iv_load_policy: 3,    // Hide annotations
        modestbranding: 1,    // Remove YouTube logo
        rel: 0,               // Disable related videos
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: (e) => this.onPlayerReady(e),
        onStateChange: (e) => this.onPlayerStateChange(e),
        onError: (e) => this.onPlayerError(e),
      },
    });
  }

  onPlayerReady(event) {
    this.isReady = true;
    if (this.loader) this.loader.classList.add("hidden");

    // Populate supported playback rates
    this.updateSpeedOptions();

    // Set initial volume
    this.ytPlayer.setVolume(this.volume);

    // Start timeline watcher loop
    this.startTimeLoop();

    // Attempt autoplay (muted first if browser blocks unmuted audio)
    try {
      this.ytPlayer.playVideo();
    } catch (e) {
      console.log("Autoplay paused by browser policy:", e);
    }
  }

  onPlayerStateChange(event) {
    // YT.PlayerState: UNSTARTED (-1), ENDED (0), PLAYING (1), PAUSED (2), BUFFERING (3), CUED (5)
    switch (event.data) {
      case window.YT.PlayerState.PLAYING:
        this.isPlaying = true;
        this.setPlayStateUI(true);
        if (this.loader) this.loader.classList.add("hidden");
        if (window.PaduraSecurity && this.broadcastId) {
          window.PaduraSecurity.startViewingHeartbeat(this.broadcastId);
        }
        break;

      case window.YT.PlayerState.PAUSED:
        this.isPlaying = false;
        this.setPlayStateUI(false);
        if (window.PaduraSecurity) {
          window.PaduraSecurity.stopViewingHeartbeat();
        }
        break;

      case window.YT.PlayerState.BUFFERING:
        if (this.loader) this.loader.classList.remove("hidden");
        break;

      case window.YT.PlayerState.ENDED:
        this.isPlaying = false;
        this.setPlayStateUI(false);
        this.showOverlayMessage("Live Stream Concluded", "The live event has ended. Thank you for watching Padura Live.");
        if (window.PaduraSecurity) {
          window.PaduraSecurity.stopViewingHeartbeat();
        }
        break;
    }

    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(event.data);
    }
  }

  onPlayerError(event) {
    if (this.loader) this.loader.classList.add("hidden");
    let title = "Playback Error";
    let desc = "Unable to load stream.";

    switch (event.data) {
      case 2:
        desc = "The broadcast URL contains invalid video parameters.";
        break;
      case 5:
        desc = "The stream cannot be played in the current HTML5 player.";
        break;
      case 100:
        title = "Stream Unavailable";
        desc = "The live stream video was not found or was set to private.";
        break;
      case 101:
      case 150:
        title = "Embedding Restricted";
        desc = "The video owner has disabled embedding for this live stream. Please check YouTube live stream settings.";
        break;
    }

    this.showOverlayMessage(title, desc);
  }

  setupEventListeners() {
    // Play/Pause button
    if (this.playBtn) {
      this.playBtn.addEventListener("click", () => this.togglePlay());
    }
    if (this.centerPlayBtn) {
      this.centerPlayBtn.addEventListener("click", () => this.togglePlay());
    }

    // Seek buttons (-10s / +10s)
    if (this.seekBackBtn) {
      this.seekBackBtn.addEventListener("click", () => this.seekRelative(-10));
    }
    if (this.seekFwdBtn) {
      this.seekFwdBtn.addEventListener("click", () => this.seekRelative(10));
    }

    // Go to Live Edge button
    if (this.liveSyncBtn) {
      this.liveSyncBtn.addEventListener("click", () => this.syncToLive());
    }

    // Timeline Scrubber
    if (this.timelineWrapper) {
      this.timelineWrapper.addEventListener("click", (e) => this.handleTimelineClick(e));
    }

    // Volume Slider & Mute
    if (this.volumeBtn) {
      this.volumeBtn.addEventListener("click", () => this.toggleMute());
    }
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        this.setVolume(val);
      });
    }

    // Speed Selector
    if (this.speedBtn && this.speedDropdown) {
      this.speedBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.speedDropdown.classList.toggle("open");
      });
      document.addEventListener("click", () => {
        this.speedDropdown.classList.remove("open");
      });
    }

    // Fullscreen Toggle
    if (this.fullscreenBtn) {
      this.fullscreenBtn.addEventListener("click", () => this.toggleFullscreen());
    }

    // Controls visibility on mouse movement
    if (this.wrapper) {
      this.wrapper.addEventListener("mousemove", () => this.handleMouseMove());
      this.wrapper.addEventListener("mouseleave", () => {
        if (this.isPlaying) {
          this.wrapper.classList.remove("controls-visible");
        }
      });
    }
  }

  handleMouseMove() {
    if (!this.wrapper) return;
    this.wrapper.classList.add("controls-visible");
    clearTimeout(this.controlsFadeTimer);
    if (this.isPlaying) {
      this.controlsFadeTimer = setTimeout(() => {
        this.wrapper.classList.remove("controls-visible");
      }, 3500);
    }
  }

  togglePlay() {
    if (!this.isReady || !this.ytPlayer) return;
    if (this.isPlaying) {
      this.ytPlayer.pauseVideo();
    } else {
      this.ytPlayer.playVideo();
    }
  }

  setPlayStateUI(playing) {
    if (this.playIcon && this.pauseIcon) {
      if (playing) {
        this.playIcon.classList.add("hidden");
        this.pauseIcon.classList.remove("hidden");
        if (this.centerPlayBtn) this.centerPlayBtn.classList.add("hidden");
      } else {
        this.playIcon.classList.remove("hidden");
        this.pauseIcon.classList.add("hidden");
        if (this.centerPlayBtn) this.centerPlayBtn.classList.remove("hidden");
      }
    }
  }

  seekRelative(seconds) {
    if (!this.isReady || !this.ytPlayer || !this.dvrAvailable) return;
    const curr = this.ytPlayer.getCurrentTime();
    this.ytPlayer.seekTo(Math.max(0, curr + seconds), true);
  }

  syncToLive() {
    if (!this.isReady || !this.ytPlayer) return;
    if (this.duration > 0) {
      this.ytPlayer.seekTo(this.duration, true);
    }
    this.ytPlayer.playVideo();
  }

  handleTimelineClick(e) {
    if (!this.isReady || !this.ytPlayer || !this.dvrAvailable || this.duration <= 0) return;
    const rect = this.timelineWrapper.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = percentage * this.duration;
    this.ytPlayer.seekTo(targetTime, true);
  }

  setVolume(val) {
    this.volume = val;
    if (!this.ytPlayer) return;
    this.ytPlayer.setVolume(val);
    if (val === 0) {
      this.isMuted = true;
      this.updateVolumeUI(true);
    } else {
      this.isMuted = false;
      this.updateVolumeUI(false);
    }
  }

  toggleMute() {
    if (!this.ytPlayer) return;
    if (this.isMuted) {
      this.ytPlayer.unMute();
      this.isMuted = false;
      this.ytPlayer.setVolume(this.volume || 80);
      if (this.volumeSlider) this.volumeSlider.value = this.volume || 80;
      this.updateVolumeUI(false);
    } else {
      this.ytPlayer.mute();
      this.isMuted = true;
      if (this.volumeSlider) this.volumeSlider.value = 0;
      this.updateVolumeUI(true);
    }
  }

  updateVolumeUI(muted) {
    const volIcon = document.getElementById("vol-icon-normal");
    const muteIcon = document.getElementById("vol-icon-muted");
    if (volIcon && muteIcon) {
      if (muted) {
        volIcon.classList.add("hidden");
        muteIcon.classList.remove("hidden");
      } else {
        volIcon.classList.remove("hidden");
        muteIcon.classList.add("hidden");
      }
    }
  }

  updateSpeedOptions() {
    if (!this.ytPlayer || !this.speedMenu) return;
    const rates = this.ytPlayer.getAvailablePlaybackRates() || [0.5, 0.75, 1, 1.25, 1.5, 2];
    this.speedMenu.innerHTML = "";

    rates.forEach((rate) => {
      const btn = document.createElement("button");
      btn.className = `speed-option ${rate === this.currentSpeed ? "active" : ""}`;
      btn.textContent = `${rate}x`;
      btn.addEventListener("click", () => {
        this.setSpeed(rate);
        this.speedDropdown.classList.remove("open");
      });
      this.speedMenu.appendChild(btn);
    });
  }

  setSpeed(rate) {
    this.currentSpeed = rate;
    if (this.ytPlayer) {
      this.ytPlayer.setPlaybackRate(rate);
    }
    if (this.speedBtn) {
      this.speedBtn.querySelector("span").textContent = `${rate}x`;
    }
    this.updateSpeedOptions();
  }

  toggleFullscreen() {
    if (!this.wrapper) return;
    if (!document.fullscreenElement) {
      if (this.wrapper.requestFullscreen) {
        this.wrapper.requestFullscreen();
      } else if (this.wrapper.webkitRequestFullscreen) {
        this.wrapper.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  /**
   * Continuous loop checking player time, duration, and DVR status
   */
  startTimeLoop() {
    clearInterval(this.timelineInterval);
    this.timelineInterval = setInterval(() => {
      if (!this.isReady || !this.ytPlayer) return;

      try {
        const cur = this.ytPlayer.getCurrentTime() || 0;
        const dur = this.ytPlayer.getDuration() || 0;
        const loadedFraction = this.ytPlayer.getVideoLoadedFraction() || 0;

        this.currentTime = cur;
        this.duration = dur;

        // Detect DVR availability: Live streams with DVR provide a valid positive duration
        this.dvrAvailable = dur > 0 && isFinite(dur);

        // Update Buffer bar
        if (this.bufferBar) {
          this.bufferBar.style.width = `${loadedFraction * 100}%`;
        }

        if (this.dvrAvailable) {
          const progressPct = Math.min(100, Math.max(0, (cur / dur) * 100));
          if (this.playedBar) this.playedBar.style.width = `${progressPct}%`;
          if (this.seekerHandle) this.seekerHandle.style.left = `${progressPct}%`;

          // Check if viewer is at live edge (within 15s)
          const diffFromLive = dur - cur;
          const isAtLiveEdge = diffFromLive <= 15;

          if (this.liveSyncBtn) {
            if (isAtLiveEdge) {
              this.liveSyncBtn.classList.add("is-live");
              this.liveSyncBtn.querySelector(".live-label").textContent = "LIVE";
            } else {
              this.liveSyncBtn.classList.remove("is-live");
              this.liveSyncBtn.querySelector(".live-label").textContent = `-${this.formatTime(diffFromLive)}`;
            }
          }

          if (this.timeDisplay) {
            this.timeDisplay.textContent = `${this.formatTime(cur)} / ${this.formatTime(dur)}`;
          }

          if (this.seekBackBtn) this.seekBackBtn.disabled = false;
          if (this.seekFwdBtn) this.seekFwdBtn.disabled = false;
        } else {
          // Standard live stream without seekable DVR
          if (this.playedBar) this.playedBar.style.width = "100%";
          if (this.liveSyncBtn) {
            this.liveSyncBtn.classList.add("is-live");
            this.liveSyncBtn.querySelector(".live-label").textContent = "LIVE";
          }
          if (this.timeDisplay) {
            this.timeDisplay.textContent = "LIVE";
          }
          if (this.seekBackBtn) this.seekBackBtn.disabled = true;
          if (this.seekFwdBtn) this.seekFwdBtn.disabled = true;
        }
      } catch (err) {
        // Player state accessing might occasionally throw if destroyed
      }
    }, 500);
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const sec = Math.floor(seconds);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  showOverlayMessage(title, description) {
    if (!this.messageOverlay) return;
    this.messageOverlay.innerHTML = `
      <svg width="60" height="60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      <h3>${title}</h3>
      <p>${description}</p>
    `;
    this.messageOverlay.classList.remove("hidden");
  }

  hideOverlayMessage() {
    if (this.messageOverlay) {
      this.messageOverlay.classList.add("hidden");
    }
  }

  destroy() {
    clearInterval(this.timelineInterval);
    if (this.ytPlayer && this.ytPlayer.destroy) {
      this.ytPlayer.destroy();
    }
  }
}

window.PaduraPlayer = PaduraPlayer;
