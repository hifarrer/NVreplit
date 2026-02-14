{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    # Chrome/Chromium dependencies required by Remotion
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

  shellHook = ''
    # Set up library path for Chrome headless shell
    export LD_LIBRARY_PATH="${pkgs.nspr}/lib:${pkgs.nss}/lib:${pkgs.alsa-lib}/lib:${pkgs.atk}/lib:${pkgs.cairo}/lib:${pkgs.glib}/lib:${pkgs.gtk3}/lib:${pkgs.pango}/lib:${pkgs.fontconfig}/lib:$LD_LIBRARY_PATH"
  '';
}
