import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

// jsdom has no object URLs; browsers do
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:test';
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
