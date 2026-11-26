/**
 * PADURA LIVE - CUSTOM YOUTUBE IFRAME LIVE PLAYER CONTROLLER
 * Integrates YouTube IFrame Player API with custom controls,
 * synced click & drag DVR timeline scrubbing, endless VOD looping,
 * speed selection, volume, and fullscreen.
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
    this.isDestroyed = false;
    this.isReady = false;
    this.isPlaying = false;
    this.isMuted = false;
    this.volume = 100;
    this.currentSpeed = 1;

    this.isLiveStream = options.isLive === true;
    this.loopNonLive = options.loopNonLive !== false;
    this.hasInitialLiveSynced = false;
    this.userHasSeeked = false;
    this.dvrAvailable = false;
    this.initialDuration = 0;
    this.liveEdge = 0;
    this.duration = 0;
    this.currentTime = 0;
    this.lastLoopTime = 0;

    this.isDragging = false;
    this.dragTargetTime = 0;
    this.pendingSeekTarget = null;
    this.seekLockUntil = 0;

    this.lastToggleTime = 0;
    this.toggleGraceUntil = 0;
    this.resumeFallbackTimer = null;

    this.timelineInterval = null;
    this.controlsFadeTimer = null;
    this._listeners = [];

    this.init();
  }

  /**
   * Register an event listener so destroy() cleanly unbinds everything
   */
  addListener(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    this._listeners.push({ target, type, handler, options });
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

    if (this.liveSyncBtn && !this.isLiveStream) {
      this.liveSyncBtn.style.display = "none";
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
        if (firstScriptTag && firstScriptTag.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
          document.head.appendChild(tag);
        }
      }

      const existingCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof existingCallback === "function") existingCallback();
        if (!this.isDestroyed) {
          this.createPlayer();
        }
      };
    }
  }

  createPlayer() {
    if (this.isDestroyed) return;

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
    if (this.isDestroyed) return;

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
    if (this.isDestroyed || !window.YT || !window.YT.PlayerState) return;

    switch (event.data) {
      case window.YT.PlayerState.PLAYING:
        clearTimeout(this.resumeFallbackTimer);
        this.isPlaying = true;
        this.setPlayStateUI(true);
        if (this.loader) this.loader.classList.add("hidden");
        if (window.PaduraSecurity && this.broadcastId) {
          window.PaduraSecurity.startViewingHeartbeat(this.broadcastId);
        }
        break;

      case window.YT.PlayerState.PAUSED:
      case window.YT.PlayerState.CUED:
        this.isPlaying = false;
        this.setPlayStateUI(false);
        if (this.loader) this.loader.classList.add("hidden");
        if (window.PaduraSecurity) {
          window.PaduraSecurity.stopViewingHeartbeat();
        }
        break;

      case window.YT.PlayerState.BUFFERING:
        if (this.loader) this.loader.classList.remove("hidden");
        break;

      case window.YT.PlayerState.ENDED:
        clearTimeout(this.resumeFallbackTimer);
        if (!this.isLiveStream && this.loopNonLive) {
          this.hideOverlayMessage();
          this.pendingSeekTarget = 0;
          this.seekLockUntil = Date.now() + 800;
          this.updateTimelineVisuals(0, this.duration);
          this.ytPlayer.seekTo(0, true);
          this.ytPlayer.playVideo();
          break;
        }

        this.isPlaying = false;
        this.setPlayStateUI(false);
        if (this.loader) this.loader.classList.add("hidden");
        this.showOverlayMessage(
          "Live Stream Concluded",
          "The live event has ended. Thank you for watching Padura Live."
        );
        if (window.PaduraSecurity) {
          window.PaduraSecurity.stopViewingHeartbeat();
        }
        break;
    }

    if (typeof this.onStateChangeCallback === "function") {
      this.onStateChangeCallback(event.data);
    }
  }

  onPlayerError(event) {
    if (this.isDestroyed) return;
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
    // Play / Pause button in controls bar
    this.addListener(this.playBtn, "click", (e) => {
      e.stopPropagation();
      this.togglePlay();
    });

    // Big center Play overlay button
    this.addListener(this.centerPlayBtn, "click", (e) => {
      e.stopPropagation();
      this.togglePlay();
    });

    // Clicking anywhere in the middle of the player toggles both play and pause
    this.addListener(this.clickShield, "click", (e) => {
      if (
        e.target &&
        typeof e.target.closest === "function" &&
        e.target.closest(".center-play-overlay, .player-controls-bar, .player-title-bar")
      ) {
        return;
      }
      this.handleMouseMove();
      this.togglePlay();
    });

    // Seek buttons (-10s / +10s)
    this.addListener(this.seekBackBtn, "click", () => this.seekRelative(-10));
    this.addListener(this.seekFwdBtn, "click", () => this.seekRelative(10));

    // Jump to Live Edge button
    this.addListener(this.liveSyncBtn, "click", () => this.syncToLive());

    // Timeline Scrubber (click + drag on mouse and touch)
    if (this.timelineWrapper) {
      this.addListener(this.timelineWrapper, "mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        this.handleDragStart(e.clientX);
      });

      this.addListener(
        this.timelineWrapper,
        "touchstart",
        (e) => {
          if (!e.touches || !e.touches[0]) return;
          if (e.cancelable) e.preventDefault();
          this.handleDragStart(e.touches[0].clientX);
        },
        { passive: false }
      );

      this.addListener(window, "mousemove", (e) => this.handleDragMove(e));
      this.addListener(window, "mouseup", (e) => this.handleDragEnd(e));
      this.addListener(window, "touchmove", (e) => this.handleDragMove(e), { passive: false });
      this.addListener(window, "touchend", (e) => this.handleDragEnd(e));
      this.addListener(window, "touchcancel", (e) => this.handleDragEnd(e));
    }

    // Volume & Mute
    this.addListener(this.volumeBtn, "click", () => this.toggleMute());
    this.addListener(this.volumeSlider, "input", (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val)) this.setVolume(val);
    });

    // Speed Selector
    if (this.speedBtn && this.speedDropdown) {
      this.addListener(this.speedBtn, "click", (e) => {
        e.stopPropagation();
        this.speedDropdown.classList.toggle("open");
      });
      this.addListener(document, "click", () => {
        this.speedDropdown.classList.remove("open");
      });
    }

    // Fullscreen Toggle
    this.addListener(this.fullscreenBtn, "click", () => this.toggleFullscreen());

    // Controls auto-hide on mouse movement
    this.addListener(this.wrapper, "mousemove", () => this.handleMouseMove());
    this.addListener(this.wrapper, "mouseleave", () => {
      if (this.isPlaying && !this.isDragging && this.wrapper) {
        this.wrapper.classList.remove("controls-visible");
      }
    });
  }

  getClientX(e) {
    if (e.touches && e.touches[0]) return e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientX;
    return typeof e.clientX === "number" ? e.clientX : null;
  }

  getSeekFromClientX(clientX) {
    const targetEl = this.timelineTrack || this.timelineWrapper;
    if (!targetEl) return { percentage: 0, targetTime: 0 };

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
      if (!this.isLiveStream) {
        this.liveSyncBtn.style.display = "none";
      } else {
        this.liveSyncBtn.style.display = "";
        if (isAtLiveEdge) {
          this.liveSyncBtn.classList.add("is-live");
          if (liveLabel) liveLabel.textContent = "LIVE";
        } else {
          this.liveSyncBtn.classList.remove("is-live");
          if (liveLabel) liveLabel.textContent = `-${this.formatTime(diffFromLive)}`;
        }
      }
    }

    if (this.timeDisplay) {
      this.timeDisplay.textContent = `${this.formatTime(clampedTime)} / ${this.formatTime(safeDur)}`;
    }
  }

  performSeek(targetTime) {
    if (!this.isReady || !this.ytPlayer || this.duration <= 0) return;

    this.userHasSeeked = true;
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
        if (!this.isDragging && this.wrapper) {
          this.wrapper.classList.remove("controls-visible");
        }
      }, 3500);
    }
  }

  togglePlay() {
    if (!this.isReady || !this.ytPlayer) return;

    // Prevent overlapping click handlers from toggling twice on a single click
    const now = Date.now();
    if (now - this.lastToggleTime < 250) return;
    this.lastToggleTime = now;
    this.toggleGraceUntil = now + 600;

    // Trust YouTube's actual player state as the source of truth (1 = PLAYING, 0 = ENDED)
    const hasStateFn = typeof this.ytPlayer.getPlayerState === "function";
    const state = hasStateFn ? this.ytPlayer.getPlayerState() : null;
    const isCurrentlyPlaying =
      typeof state === "number" ? state === 1 : this.isPlaying;

    clearTimeout(this.resumeFallbackTimer);

    if (isCurrentlyPlaying) {
      this.isPlaying = false;
      this.setPlayStateUI(false);
      if (this.loader) this.loader.classList.add("hidden");
      this.ytPlayer.pauseVideo();
      return;
    }

    // Resume playback
    this.hideOverlayMessage();
    this.isPlaying = true;
    this.setPlayStateUI(true);

    if (state === 0) {
      this.ytPlayer.seekTo(0, true);
    }
    this.ytPlayer.playVideo();

    // Recovery fallback if YouTube stays stuck in PAUSED/CUED after clicking Play
    this.resumeFallbackTimer = setTimeout(() => {
      if (
        this.isDestroyed ||
        !this.ytPlayer ||
        typeof this.ytPlayer.getPlayerState !== "function"
      ) {
        return;
      }

      const afterState = this.ytPlayer.getPlayerState();
      // Only intervene if YouTube is NOT playing (1) and NOT actively buffering (3)
      if (afterState !== 1 && afterState !== 3) {
        if (this.isLiveStream) {
          const liveTarget = Math.max(
            this.ytPlayer.getDuration() || 0,
            this.liveEdge,
            this.duration
          );
          if (liveTarget > 0) {
            this.ytPlayer.seekTo(liveTarget, true);
          }
        } else {
          const cur = this.ytPlayer.getCurrentTime() || 0;
          this.ytPlayer.seekTo(cur, true);
        }
        this.ytPlayer.playVideo();
      }
    }, 450);
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
      this.pendingSeekTarget !== null
        ? this.pendingSeekTarget
        : this.ytPlayer.getCurrentTime() || 0;
    this.performSeek(baseTime + seconds);
  }

  syncToLive() {
    if (!this.isReady || !this.ytPlayer) return;

    const rawDur = this.ytPlayer.getDuration() || 0;
    const liveTarget = Math.max(rawDur, this.liveEdge, this.duration);

    if (liveTarget > 0) {
      const seekTarget = this.isLiveStream ? liveTarget + 60 : liveTarget;
      this.userHasSeeked = true;
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
      const restored = this.volume || 80;
      this.ytPlayer.setVolume(restored);
      if (this.volumeSlider) this.volumeSlider.value = restored;
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
    const rates =
      (typeof this.ytPlayer.getAvailablePlaybackRates === "function" &&
        this.ytPlayer.getAvailablePlaybackRates()) || [0.5, 0.75, 1, 1.25, 1.5, 2];

    this.speedMenu.innerHTML = "";

    rates.forEach((rate) => {
      const btn = document.createElement("button");
      btn.type = "button";
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
    if (this.ytPlayer && typeof this.ytPlayer.setPlaybackRate === "function") {
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
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (this.wrapper.requestFullscreen) {
        this.wrapper.requestFullscreen();
      } else if (this.wrapper.webkitRequestFullscreen) {
        this.wrapper.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  /**
   * Continuous loop syncing player state, timeline, duration, and live edge
   */
  startTimeLoop() {
    clearInterval(this.timelineInterval);
    this.lastLoopTime = Date.now();

    this.timelineInterval = setInterval(() => {
      if (
        this.isDestroyed ||
        !this.isReady ||
        !this.ytPlayer ||
        typeof this.ytPlayer.getCurrentTime !== "function"
      ) {
        return;
      }

      const now = Date.now();
      const dt = Math.max(0, (now - this.lastLoopTime) / 1000);
      this.lastLoopTime = now;

      try {
        const state =
          typeof this.ytPlayer.getPlayerState === "function"
            ? this.ytPlayer.getPlayerState()
            : null;

        // Self-heal play/pause state if YouTube ever drops an onStateChange event
        if (now >= this.toggleGraceUntil && typeof state === "number") {
          if (state === 1 && !this.isPlaying) {
            this.isPlaying = true;
            this.setPlayStateUI(true);
            if (this.loader) this.loader.classList.add("hidden");
          } else if ((state === 2 || state === 5) && this.isPlaying) {
            this.isPlaying = false;
            this.setPlayStateUI(false);
            if (this.loader) this.loader.classList.add("hidden");
          }
        }

        const cur = this.ytPlayer.getCurrentTime() || 0;
        const rawDur = this.ytPlayer.getDuration() || 0;
        const loadedFraction = this.ytPlayer.getVideoLoadedFraction() || 0;
        const videoData =
          typeof this.ytPlayer.getVideoData === "function" ? this.ytPlayer.getVideoData() : null;

        // Detect live stream: 0 duration while playing (no DVR) or growing duration (DVR)
        if (rawDur === 0 && this.isPlaying) {
          this.isLiveStream = true;
        }
        if (this.initialDuration === 0 && rawDur > 0) {
          this.initialDuration = rawDur;
        }
        if (
          (videoData && videoData.isLive === true) ||
          (this.initialDuration > 0 && rawDur > this.initialDuration + 1.5)
        ) {
          this.isLiveStream = true;
        }

        // Keep duration synced without letting liveEdge drift far ahead of YouTube
        let effectiveDuration = rawDur;
        if (this.isLiveStream) {
          if (rawDur > 0) {
            const nextEdge =
              this.liveEdge > 0 ? this.liveEdge + (this.isPlaying ? dt : 0) : Math.max(rawDur, cur);
            this.liveEdge = Math.min(Math.max(nextEdge, rawDur, cur), rawDur + 5);
            effectiveDuration = this.liveEdge;
          }
        } else if (cur > rawDur && rawDur > 0) {
          effectiveDuration = cur;
        }

        this.currentTime = cur;
        this.duration = effectiveDuration;
        this.dvrAvailable = effectiveDuration > 0 && isFinite(effectiveDuration);

        // If joining an active DVR livestream at 00:00, auto-snap to live edge once
        if (
          this.isLiveStream &&
          this.isPlaying &&
          !this.hasInitialLiveSynced &&
          !this.userHasSeeked &&
          effectiveDuration > 30 &&
          effectiveDuration - cur > 30
        ) {
          this.hasInitialLiveSynced = true;
          this.seekLockUntil = now + 800;
          this.updateTimelineVisuals(effectiveDuration, effectiveDuration);
          this.ytPlayer.seekTo(effectiveDuration, true);
          return;
        }

        if (this.bufferBar) {
          this.bufferBar.style.width = `${Math.min(100, Math.max(0, loadedFraction * 100))}%`;
        }

        // Unlock seek lock as soon as YouTube reaches the sought keyframe
        if (this.pendingSeekTarget !== null) {
          if (Math.abs(cur - this.pendingSeekTarget) <= 4 || now >= this.seekLockUntil) {
            this.pendingSeekTarget = null;
            this.seekLockUntil = 0;
          }
        }

        // Loop non-live videos just before the end so YouTube's end-screen never flashes
        if (
          !this.isLiveStream &&
          this.loopNonLive &&
          this.isPlaying &&
          state === 1 &&
          !this.isDragging &&
          now >= this.seekLockUntil &&
          effectiveDuration > 2 &&
          cur >= effectiveDuration - 0.5
        ) {
          this.pendingSeekTarget = 0;
          this.seekLockUntil = now + 1000;
          this.updateTimelineVisuals(0, effectiveDuration);
          this.ytPlayer.seekTo(0, true);
          this.ytPlayer.playVideo();
          return;
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
            this.liveSyncBtn.style.display = "";
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
        // Player may be torn down mid-tick
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

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  showOverlayMessage(title, description) {
    if (!this.messageOverlay) return;
    this.messageOverlay.innerHTML = `
      <svg width="60" height="60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      <h3>${this.escapeHtml(title)}</h3>
      <p>${this.escapeHtml(description)}</p>
    `;
    this.messageOverlay.classList.remove("hidden");
  }

  hideOverlayMessage() {
    if (this.messageOverlay) {
      this.messageOverlay.classList.add("hidden");
    }
  }

  destroy() {
    this.isDestroyed = true;
    clearInterval(this.timelineInterval);
    clearTimeout(this.controlsFadeTimer);
    clearTimeout(this.resumeFallbackTimer);
    this.isDragging = false;
    this.pendingSeekTarget = null;
    if (this.wrapper) this.wrapper.classList.remove("is-dragging");

    this._listeners.forEach(({ target, type, handler, options }) => {
      target.removeEventListener(type, handler, options);
    });
    this._listeners = [];

    if (window.PaduraSecurity) {
      window.PaduraSecurity.stopViewingHeartbeat();
    }
    if (this.ytPlayer && typeof this.ytPlayer.destroy === "function") {
      this.ytPlayer.destroy();
    }
    this.ytPlayer = null;
  }
}

window.PaduraPlayer = PaduraPlayer;