/**
 * PADURA LIVE - CUSTOM YOUTUBE IFRAME LIVE PLAYER CONTROLLER
 * Integrates YouTube IFrame Player API with custom controls,
 * click & drag DVR timeline scrubbing, speed selection, volume, and fullscreen.
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
    this.maxObservedTime = 0;

    this.isDragging = false;
    this.dragTargetTime = 0;
    this.seekLockUntil = 0;

    this.timelineInterval = null;
    this.controlsFadeTimer = null;
    this.abortController = new AbortController();

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
    this.clickShield = this.wrapper?.querySelector(".player-click-shield") || null;
    this.playBtn = document.getElementById("player-play-btn");
    this.centerPlayBtn = document.getElementById("center-play-overlay");
    this.playIcon = document.getElementById("play-icon");
    this.pauseIcon = document.getElementById("pause-icon");
    this.timelineWrapper = document.getElementById("player-timeline-wrapper");
    this.playedBar = document.getElementById("player-played-bar");
    this.bufferBar = document.getElementById("player-buffer-bar");
    this.seekerHandle = document.getElementBy