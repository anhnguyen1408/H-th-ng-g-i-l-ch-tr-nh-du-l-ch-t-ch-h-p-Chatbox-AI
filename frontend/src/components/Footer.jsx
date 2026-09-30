const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-gray-200 bg-white/90 backdrop-blur">
      <div className="bg-gradient-to-r from-primary-500 to-blue-500 h-0.5 w-full" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row items-center justify-between text-sm text-gray-500">
        <div className="text-center md:text-left">
          <p className="font-semibold text-gray-800">AI Travel Planner</p>
          <p className="text-gray-500 mt-1">
            Lên kế hoạch, tối ưu và chia sẻ chuyến đi của bạn chỉ trong vài phút.
          </p>
        </div>
        <div className="flex flex-col items-center md:items-end gap-1 mt-4 md:mt-0">
          <span className="text-gray-500">© {year} AI Travel Planner.</span>
          <span className="text-xs text-gray-400">All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
