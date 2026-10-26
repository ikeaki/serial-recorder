// src/hooks/useFeedback.ts

import {
  useEffect,
  useRef,
} from "react";

export const useFeedback = () => {
  const audioContextRef =
    useRef<AudioContext | null>(
      null
    );

  const lastSuccessBeepRef =
    useRef(0);

  const lastErrorBeepRef =
    useRef(0);

  const getAudioContext =
    (): AudioContext => {
      if (
        !audioContextRef.current
      ) {
        audioContextRef.current =
          new AudioContext();
      }

      return audioContextRef.current;
    };

  const playSuccess = () => {
    const now =
      Date.now();

    if (
      now -
        lastSuccessBeepRef.current <
      200
    ) {
      return;
    }

    lastSuccessBeepRef.current =
      now;

    const audioContext =
      getAudioContext();

    const oscillator =
      audioContext
        .createOscillator();

    const gain =
      audioContext
        .createGain();

    oscillator.type =
      "sine";

    oscillator.frequency.value =
      1200;

    gain.gain.value =
      0.3;

    oscillator.connect(
      gain
    );

    gain.connect(
      audioContext.destination
    );

    oscillator.start();

    oscillator.stop(
      audioContext.currentTime +
        0.1
    );
  };

  const playError = () => {
    const now =
      Date.now();

    if (
      now -
        lastErrorBeepRef.current <
      200
    ) {
      return;
    }

    lastErrorBeepRef.current =
      now;

    const audioContext =
      getAudioContext();

    const oscillator =
      audioContext
        .createOscillator();

    const gain =
      audioContext
        .createGain();

    oscillator.type =
      "square";

    oscillator.frequency.value =
      300;

    gain.gain.value =
      0.1;

    oscillator.connect(
      gain
    );

    gain.connect(
      audioContext.destination
    );

    oscillator.start();

    oscillator.stop(
      audioContext.currentTime +
        0.15
    );
  };

  const vibrateSuccess = () => {
    if (
      "vibrate" in navigator
    ) {
      navigator.vibrate(
        100
      );
    }
  };

  const vibrateError = () => {
    if (
      "vibrate" in navigator
    ) {
      navigator.vibrate([
        400,
        100,
        100,
      ]);
    }
  };

  useEffect(() => {
    return () => {
      const audioContext =
        audioContextRef.current;

      audioContextRef.current =
        null;

      if (
        audioContext &&
        audioContext.state !==
          "closed"
      ) {
        void audioContext.close();
      }
    };
  }, []);

  return {
    playSuccess,
    playError,
    vibrateSuccess,
    vibrateError,
  };
};