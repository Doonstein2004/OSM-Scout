import React from 'react';
import { StoreProvider } from './context/StoreContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import MainApp from './MainApp';
import './global.css';

export default function App() {
    return (
        <ErrorBoundary>
            <StoreProvider>
                <MainApp />
            </StoreProvider>
        </ErrorBoundary>
    );
}
