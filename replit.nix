{ pkgs }: {
  deps = [
    pkgs.nodejs-20_x
    pkgs.nspr
    pkgs.nss
    pkgs.alsa-lib
    pkgs.atk
    pkgs.cairo
    pkgs.dbus
    pkgs.fontconfig
    pkgs.freetype
    pkgs.glib
    pkgs.gtk3
    pkgs.pango
    pkgs.xorg.libX11
    pkgs.xorg.libXcomposite
    pkgs.xorg.libXdamage
    pkgs.xorg.libXext
    pkgs.xorg.libXfixes
    pkgs.xorg.libXrandr
    pkgs.xorg.libXtst
    pkgs.xorg.libxshmfence
  ];
}
