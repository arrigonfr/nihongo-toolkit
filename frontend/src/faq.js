import "./practice.css";
import "./study-controls.css";
import "./ui-kit.css";
import "./faq.css";
import "./navigation.js";
import { mountAppearance } from "./appearance.js";
import { mountSupport } from "./study-controls.js";
import { mountSectionLinks } from "./section-links.js";

mountAppearance(document.querySelector("header"), document.getElementById("themeButton"));
mountSupport();
mountSectionLinks(document.querySelectorAll(".faq-topics a"));
