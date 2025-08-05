/**
 * @fileoverview Utility Functions for Daf Renderer
 * 
 * This module provides common utility functions used throughout the daf renderer,
 * including DOM manipulation helpers and performance optimization utilities.
 */

/**
 * Debounce function to limit how often a function can be called
 * Used primarily for resize event handlers to improve performance
 * 
 * @param {Function} func - The function to debounce
 * @param {number} wait - The debounce delay in milliseconds
 * @returns {Function} The debounced function
 * 
 * @example
 * const debouncedResize = debounce(handleResize, 100);
 * window.addEventListener('resize', debouncedResize);
 */
export function debounce(func, wait) {
  let timeout;
  
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Create DOM element with optional parent
 * @param {string} tag - HTML tag name
 * @param {HTMLElement} parent - Optional parent element
 * @returns {HTMLElement} The created element
 */
export function createElement(tag, parent) {
  const newEl = document.createElement(tag);
  if (parent) parent.append(newEl);
  return newEl;
}

/**
 * Create div element with optional parent
 * @param {HTMLElement} parent - Optional parent element
 * @returns {HTMLDivElement} The created div element
 */
export function createDiv(parent) {
  return createElement("div", parent);
}

/**
 * Create span element with optional parent
 * @param {HTMLElement} parent - Optional parent element
 * @returns {HTMLSpanElement} The created span element
 */
export function createSpan(parent) {
  return createElement("span", parent);
}