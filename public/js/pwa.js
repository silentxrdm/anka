(function(){
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(()=>{});
  }
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (isIOS && !isStandalone) {
    // no-op hint spot
  }
})();
