{ pkgs }: {
  deps = with pkgs; [
    nodejs_20
    postgresql_16
    ffmpeg

    # Chrome/Chromium dependencies required by Remotion's headless browser
    nspr
    nss
    alsa-lib
    atk
    cairo
    cups
    dbus
    expat
    fontconfig
    freetype
    gdk-pixbuf
    glib
    gtk3
    libdrm
    libxkbcommon
    mesa
    pango
    xorg.libX11
    xorg.libXcomposite
    xorg.libXdamage
    xorg.libXext
    xorg.libXfixes
    xorg.libXrandr
    xorg.libxshmfence
    xorg.libXScrnSaver
    xorg.libXtst
  ];
}
