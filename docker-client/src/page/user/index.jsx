// import Image from "next/image"

import Footer from 'components/Footer';
import Sidebar from 'components/Sidebar';
import TopHeader from 'components/TopHeader';
import { useUIController } from 'context/context';
import { Outlet } from 'react-router-dom';

import OverlayBackdrop from 'components/UIElements/OverlayBackdrop';

export default function UserLayout() {
  const [controller] = useUIController();
  const { isSidebarOpen } = controller;
  return (
    <div className="dashboard">
      <Sidebar />
      <TopHeader />
      <OverlayBackdrop />
      <div
        className={`page-container grid grid-cols-12 auto-rows-max items-stretch grid-flow-row-dense w-full gap-4 2xl:gap-8 ${isSidebarOpen ? 'lg:w-[calc(100%-150px)] 2xl:w-[calc(100%-250px)]' : 'lg:w-[calc(100%-60px)] 2xl:w-[calc(100%-100px)]'}`}
      >
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
