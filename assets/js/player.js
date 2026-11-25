/**
 * PADURA LIVE - CUSTOM YOUTUBE IFRAME LIVE PLAYER CONTROLLER
 * Integrates YouTube IFrame Player API with custom controls,
 * synced click & drag DVR timeline scrubbing, speed selection, volume, and fullscreen.
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
    this.isLiveStream = false;
    this.initialDuration = 0;
    this.liveEdge = 0;
    this.duration = 0;
    this.currentTime = 0;
    this.lastLoopTime = 0;

    this.isDragging = false;
    this.dragTargetTime = 0;
    this.pendingSeekTarget = null;
    this.seekLockUntil = 0;

    this.timelineInterval = null;
    this.controlsFadeTimer = null;

    this._onDragMove = this.handleDragMove.bind(this);
    this._onDragEnd = this.handleDragEnd.bind(this);
    this._onDocClick = () => {
      if (this.speedDropdown) this.speedDropdown.classList.remove("open");
    };

    this.init();
  }

  init() {
    this.bindDomElements();
    this.loadYouTubeIframeAPI();
  }

  bindDomElements() {
    this.wrapper = document.getElementById(this.wrapperId);
    this.wrapper = document.getElementById(this.wrapperId);
    this.clickShield =
      document.getElementById("player-click-shield") ||
      (this.wrapper ? this.wrapper.querySelector(".player-click-shield") : null);
    this.playBtn = document.getElementById("player-play-btn");
    this.centerPlayBtn = document.getElementById("center-play-overlay");
    this.playIcon = document.getElementById("play-icon");
    this.pauseIcon = document.getElementById("pause-icon");
    this.timelineWrapper = document.getElementById("player-timeline-wrapper");
    this.timelineTrack = this.timelineWrapper
      ? this.timelineWrapper.querySelector(".player-timeline-track")
      : null;
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
      let tag = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!tag) {
        tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }

      const existingCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (existingCallback) existingCallback();
        this.createPlayer();
      };
    }
  }

  createPlayer() {
    if (!this.videoId) {
      this.showOverlayMessage(
        "No Stream Available",
        "No broadcast video has been assigned to this event."
      );
      return;
    }

    this.hideOverlayMessage();

    this.ytPlayer = new window.YT.Player(this.mountId, {
      videoId: this.videoId,
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        enablejsapi: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
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

    this.updateSpeedOptions();
    this.ytPlayer.setVolume(this.volume);
    this.startTimeLoop();

    try {
      this.ytPlayer.playVideo();
    } catch (e) {
      console.log("Autoplay paused by browser policy:", e);
    }
  }

  onPlayerStateChange(event) {
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
        this.showOverlayMessage(
          "Live Stream Concluded",
          "The live event has ended. Thank you for watching Padura Live."
        );
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
        desc =
          "The video owner has disabled embedding for this live stream. Please check YouTube live stream settings.";
        break;
    }

    this.showOverlayMessage(title, desc);
  }

  setupEventListeners() {
    if (this.playBtn) {
      this.playBtn.addEventListener("click", () => this.togglePlay());
    }
    if (this.centerPlayBtn) {
      this.centerPlayBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.togglePlay();
      });
    }

    if (this.clickShield) {
      this.clickShield.addEventListener("click", (e) => {
        if (e.target.closest(".center-play-overlay, .player-controls-bar, .player-title-bar")) {
          return;
        }
        this.handleMouseMove();
        this.togglePlay();
      });
    }

    if (this.seekBackBtn) {
      this.seekBackBtn.addEventListener("click", () => this.seekRelative(-10));
    }
    if (this.seekFwdBtn) {
      this.seekFwdBtn.addEventListener("click", () => this.seekRelative(10));
    }

    if (this.liveSyncBtn) {
      this.liveSyncBtn.addEventListener("click", () => this.syncToLive());
    }

    // Timeline Scrubber (click + drag on desktop & touch)
    if (this.timelineWrapper) {
      this.timelineWrapper.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        this.handleDragStart(e.clientX);
      });

      this.timelineWrapper.addEventListener(
        "touchstart",
        (e) => {
          if (!e.touches || !e.touches[0]) return;
          if (e.cancelable) e.preventDefault();
          this.handleDragStart(e.touches[0].clientX);
        },
        { passive: false }
      );

      window.addEventListener("mousemove", this._onDragMove);
      window.addEventListener("mouseup", this._onDragEnd);
      window.addEventListener("touchmove", this._onDragMove, { passive: false });
      window.addEventListener("touchend", this._onDragEnd);
      window.addEventListener("touchcancel", this._onDragEnd);
    }

    if (this.volumeBtn) {
      this.volumeBtn.addEventListener("click", () => this.toggleMute());
    }
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        this.setVolume(val);
      });
    }

    if (this.speedBtn && this.speedDropdown) {
      this.speedBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.speedDropdown.classList.toggle("open");
      });
      document.addEventListener("click", this._onDocClick);
    }

    if (this.fullscreenBtn) {
      this.fullscreenBtn.addEventListener("click", () => this.toggleFullscreen());
    }

    if (this.wrapper) {
      this.wrapper.addEventListener("mousemove", () => this.handleMouseMove());
      this.wrapper.addEventListener("mouseleave", () => {
        if (this.isPlaying && !this.isDragging) {
          this.wrapper.classList.remove("controls-visible");
        }
      });
    }
  }

  getClientX(e) {
    if (e.touches && e.touches[0]) return e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientX;
    return typeof e.clientX === "number" ? e.clientX : null;
  }

  getSeekFromClientX(clientX) {
    const targetEl = this.timelineTrack || this.timelineWrapper;
    const rect = targetEl.getBoundingClientRect();
    if (!rect.width || this.duration <= 0) {
      return { percentage: 0, targetTime: 0 };
    }
    const offsetX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    return { percentage, targetTime: percentage * this.duration };
  }

  updateTimelineVisuals(targetTime, duration) {
    const safeDur = duration > 0 ? duration : 1;
    const clampedTime = Math.max(0, Math.min(safeDur, targetTime));
    const progressPct = (clampedTime / safeDur) * 100;

    if (this.playedBar) this.playedBar.style.width = `${progressPct}%`;
    if (this.seekerHandle) this.seekerHandle.style.left = `${progressPct}%`;

    const diffFromLive = Math.max(0, safeDur - clampedTime);
    const isAtLiveEdge = diffFromLive <= 15;
    const liveLabel = this.liveSyncBtn ? this.liveSyncBtn.querySelector(".live-label") : null;

    if (this.liveSyncBtn) {
      if (isAtLiveEdge) {
        this.liveSyncBtn.classList.add("is-live");
        if (liveLabel) liveLabel.textContent = "LIVE";
      } else {
        this.liveSyncBtn.classList.remove("is-live");
        if (liveLabel) liveLabel.textContent = `-${this.formatTime(diffFromLive)}`;
      }
    }

    if (this.timeDisplay) {
      this.timeDisplay.textContent = `${this.formatTime(clampedTime)} / ${this.formatTime(safeDur)}`;
    }
  }

  performSeek(targetTime) {
    const clamped = Math.max(0, Math.min(this.duration, targetTime));
    this.pendingSeekTarget = clamped;
    this.seekLockUntil = Date.now() + 1200;
    this.updateTimelineVisuals(clamped, this.duration);
    this.ytPlayer.seekTo(clamped, true);
  }

  handleDragStart(clientX) {
    if (!this.isReady || !this.ytPlayer || !this.dvrAvailable || this.duration <= 0) return;
    this.isDragging = true;
    if (this.wrapper) this.wrapper.classList.add("is-dragging");
    const pos = this.getSeekFromClientX(clientX);
    this.dragTargetTime = pos.targetTime;
    this.updateTimelineVisuals(pos.targetTime, this.duration);
  }

  handleDragMove(e) {
    if (!this.isDragging) return;
    if (e.cancelable) e.preventDefault();
    const clientX = this.getClientX(e);
    if (clientX === null) return;
    const pos = this.getSeekFromClientX(clientX);
    this.dragTargetTime = pos.targetTime;
    this.updateTimelineVisuals(pos.targetTime, this.duration);
  }

  handleDragEnd(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.wrapper) this.wrapper.classList.remove("is-dragging");

    const clientX = this.getClientX(e);
    const targetTime =
      clientX !== null ? this.getSeekFromClientX(clientX).targetTime : this.dragTargetTime;

    this.performSeek(targetTime);
  }

  handleMouseMove() {
    if (!this.wrapper) return;
    this.wrapper.classList.add("controls-visible");
    clearTimeout(this.controlsFadeTimer);
    if (this.isPlaying && !this.isDragging) {
      this.controlsFadeTimer = setTimeout(() => {
        if (!this.isDragging) {
          this.wrapper.classList.remove("controls-visible");
        }
      }, 3500);
    }
  }

  togglePlay() {
    if (!this.isReady || !this.ytPlayer) return;
    const state =
      typeof this.ytPlayer.getPlayerState === "function"
        ? this.ytPlayer.getPlayerState()
        : null;

    if (this.isPlaying || state === window.YT.PlayerState.PLAYING) {
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
    const baseTime =
      this.pendingSeekTarget !== null ? this.pendingSeekTarget : this.ytPlayer.getCurrentTime() || 0;
    this.performSeek(baseTime + seconds);
  }

  syncToLive() {
    if (!this.isReady || !this.ytPlayer) return;
    const rawDur = this.ytPlayer.getDuration() || 0;
    const liveTarget = Math.max(rawDur, this.liveEdge, this.duration);

    if (liveTarget > 0) {
      // Overshoot slightly on live streams so YouTube snaps to the true live head
      const seekTarget = this.isLiveStream ? liveTarget + 60 : liveTarget;
      this.pendingSeekTarget = null;
      this.seekLockUntil = Date.now() + 800;
      this.updateTimelineVisuals(liveTarget, liveTarget);
      this.ytPlayer.seekTo(seekTarget, true);
    }
    this.ytPlayer.playVideo();
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
        if (this.speedDropdown) this.speedDropdown.classList.remove("open");
      });
      this.speedMenu.appendChild(btn);
    });
  }

  setSpeed(rate) {
    this.currentSpeed = rate;
    if (this.ytPlayer) {
      this.ytPlayer.setPlaybackRate(rate);
    }
    const speedSpan = this.speedBtn ? this.speedBtn.querySelector("span") : null;
    if (speedSpan) {
      speedSpan.textContent = `${rate}x`;
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

  startTimeLoop() {
    clearInterval(this.timelineInterval);
    this.lastLoopTime = Date.now();

    this.timelineInterval = setInterval(() => {
      if (!this.isReady || !this.ytPlayer) return;

      const now = Date.now();
      const dt = Math.max(0, (now - this.lastLoopTime) / 1000);
      this.lastLoopTime = now;

      try {
        const cur = this.ytPlayer.getCurrentTime() || 0;
        const rawDur = this.ytPlayer.getDuration() || 0;
        const loadedFraction = this.ytPlayer.getVideoLoadedFraction() || 0;
        const videoData =
          typeof this.ytPlayer.getVideoData === "function" ? this.ytPlayer.getVideoData() : null;

        // Detect live stream via API flag or growing duration
        if (this.initialDuration === 0 && rawDur > 0) {
          this.initialDuration = rawDur;
        }
        if (
          (videoData && videoData.isLive) ||
          (this.initialDuration > 0 && rawDur > this.initialDuration + 1)
        ) {
          this.isLiveStream = true;
        }

        // Keep live edge synced in real time even when YouTube's getDuration() lags
        let effectiveDuration = rawDur;
        if (this.isLiveStream) {
          if (this.liveEdge > 0) {
            this.liveEdge += dt;
          }
          this.liveEdge = Math.max(this.liveEdge, rawDur, cur);
          effectiveDuration = this.liveEdge;
        } else if (cur > rawDur && rawDur > 0) {
          effectiveDuration = cur;
        }

        this.currentTime = cur;
        this.duration = effectiveDuration;
        this.dvrAvailable = effectiveDuration > 0 && isFinite(effectiveDuration);

        if (this.bufferBar) {
          this.bufferBar.style.width = `${Math.min(100, Math.max(0, loadedFraction * 100))}%`;
        }

        // Unlock seek as soon as YouTube actually moves to the target keyframe
        if (this.pendingSeekTarget !== null) {
          if (Math.abs(cur - this.pendingSeekTarget) <= 4 || now >= this.seekLockUntil) {
            this.pendingSeekTarget = null;
            this.seekLockUntil = 0;
          }
        }

        if (this.isDragging || now < this.seekLockUntil) return;

        if (this.dvrAvailable) {
          this.updateTimelineVisuals(cur, effectiveDuration);
          if (this.seekBackBtn) this.seekBackBtn.disabled = false;
          if (this.seekFwdBtn) this.seekFwdBtn.disabled = false;
        } else {
          const liveLabel = this.liveSyncBtn ? this.liveSyncBtn.querySelector(".live-label") : null;
          if (this.playedBar) this.playedBar.style.width = "100%";
          if (this.seekerHandle) this.seekerHandle.style.left = "100%";
          if (this.liveSyncBtn) {
            this.liveSyncBtn.classList.add("is-live");
            if (liveLabel) liveLabel.textContent = "LIVE";
          }
          if (this.timeDisplay) {
            this.timeDisplay.textContent = "LIVE";
          }
          if (this.seekBackBtn) this.seekBackBtn.disabled = true;
          if (this.seekFwdBtn) this.seekFwdBtn.disabled = true;
        }
      } catch (err) {
        // Player may be destroyed
      }
    }, 200);
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const sec = Math.floor(seconds);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
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
    clearTimeout(this.controlsFadeTimer);
    this.isDragging = false;
    this.pendingSeekTarget = null;
    if (this.wrapper) this.wrapper.classList.remove("is-dragging");

    window.removeEventListener("mousemove", this._onDragMove);
    window.removeEventListener("mouseup", this._onDragEnd);
    window.removeEventListener("touchmove", this._onDragMove);
    window.removeEventListener("touchend", this._onDragEnd);
    window.removeEventListener("touchcancel", this._onDragEnd);
    document.removeEventListener("click", this._onDocClick);

    if (window.PaduraSecurity) {
      window.PaduraSecurity.stopViewingHeartbeat();
    }
    if (this.ytPlayer && this.ytPlayer.destroy) {
      this.ytPlayer.destroy();
    }
  }
}

window.PaduraPlayer = PaduraPlayer;