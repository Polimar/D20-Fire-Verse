/** Legacy /forge URL: the builder lives in the title-menu modal. */
if (location.pathname === "/forge" || location.pathname === "/forge/") {
  location.replace("/?builder=open");
}
