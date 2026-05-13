// CameraStream.js
import React, { useContext, useEffect, useRef, useState } from 'react';
import { LuMaximize, } from 'react-icons/lu';
import StreamModal from '../CameraStreamsModal/StreamModal';
import UserContext from '@/context/UserContext/Context';
import { AiOutlineLoading } from "react-icons/ai";

const CameraStream = ({
  config,
  maxminBtnclass,
  maxsize,
  minsize,
  label,
  controlSocket,
  key,
  selectedVideo, 
  setSelectedVideo,
  containerClassName = ""
}) => {
  const socket_Url = import.meta.env.VITE_SOCKET_URL;
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const wsRef = useRef(null);
  const {streamModalShow,setStreamModalShow} = useContext(UserContext)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // const [isLoading, setIsLoading] = useState(true);

  function closeStream(RtspChannel) {
    const controlSocket = new WebSocket(
      `${socket_Url}/${RtspChannel}`
    );

    controlSocket.onopen = () => {
      controlSocket.send('stop');

      setTimeout(() => {
        controlSocket.close();
      }, 200); // wait 200ms to ensure server gets message
    };

    controlSocket.onerror = (e) => {
      console.error('Control socket error:', e);
    };

    controlSocket.onclose = (e) => {
      console.warn(
        'Control socket closed:',
        `${socket_Url}/${config.RtspChannel}`,
        e
      );
    };
  }

  useEffect(() => {
    let waitForJSMpeg;
    // setIsLoading(true); // Set loading true when config changes

    // BACKEND DEV NOTE:
    // If the backend cannot fetch or connect to the RTSP/camera stream,
    // please send a clear error or "stream unavailable" message over the WebSocket.
    // The frontend currently keeps retrying and shows a loading spinner forever.
    // With this error message, the frontend can show a proper error to the user
    // and stop retrying, improving the user experience.

    const isValidSocketUrl = (value) => {
      return (
        (typeof value === 'string' && value.startsWith('ws://')) ||
        value instanceof WebSocket
      );
    };

    const initializePlayer = () => {
      if (!window.JSMpeg || !window.JSMpeg.Player) return;
      if (playerRef.current) return; // prevent re-initialization
      if (!canvasRef.current) return;

      const socketUrl = isValidSocketUrl(
        `${socket_Url}/${config.RtspChannel}`
      )
        ? `${socket_Url}/${config.RtspChannel}`
        : null;
      if (!socketUrl) {
        console.warn('Invalid stream URL');
        // setIsLoading(false);
        return;
      }

      try {
        playerRef.current = new window.JSMpeg.Player(socketUrl, {
          canvas: canvasRef.current,
          autoplay: true,
          audio: true,
          // onPlay: () => {
          //   // Hide loading indicator when stream starts playing
          //   setTimeout(() => setIsLoading(false), 500);
          // }
        });
        clearInterval(waitForJSMpeg);
      } catch (err) {
        console.error('Failed to initialize JSMpeg Player:', err);
        // setIsLoading(false);
      }
    };

    waitForJSMpeg = setInterval(initializePlayer, 100);
    return () => {
      clearInterval(waitForJSMpeg);
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
          closeStream(config.RtspChannel);
        } catch (e) {
          console.warn('Error destroying player:', e);
        }
        playerRef.current = null;
      }
      // setIsLoading(true);
    };
  }, [config]);


  useEffect(() => {
    const handleBeforeUnload = () => {
      closeStream(config.RtspChannel);
    };
  
    window.addEventListener('beforeunload', handleBeforeUnload);
  
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);


  useEffect(() => {
    const container = containerRef.current;

    if (isFullscreen) {
     
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (container.msRequestFullscreen) {
        container.msRequestFullscreen();
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    }
  }, [isFullscreen]);

//   useEffect(()=>{
// if(streamModalShow){
//    setIsModalOpen(true)
   
// }
// console.log(streamModalShow);
//   },[streamModalShow])


    const closeModal = () => {
    setStreamModalShow(false);
    // setIsFullscreen(false); // optionally exit fullscreen when modal closes
  };
  return (
    <>
      <div
        ref={containerRef}
        className={`relative overflow-hidden w-full h-full ${containerClassName}`}
      >
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        className={`w-full h-full ${containerClassName}`}
      />
      {/*
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80 z-10">
          <div className="flex flex-col items-center">
            <AiOutlineLoading className="animate-spin h-8 w-8 text-[#07486A] mb-2" />
            <span className="text-white font-[400] text-sm">Loading...</span>
          </div>
        </div>
      )}
      */}
      <button
        onClick={() => {
          setSelectedVideo(config);
          setStreamModalShow(true)}}
        className={`${maxminBtnclass} cursor-pointer`}
      >
        <LuMaximize className={`${maxsize} cursor-pointer`} />
      </button>
    </div>
   { config?.RtspChannel==selectedVideo?.RtspChannel && <StreamModal config={config} containerRef={containerRef} canvasRef ={canvasRef}isOpen={streamModalShow} onClose={closeModal}/>}
    </>

  );
};

export default CameraStream;
