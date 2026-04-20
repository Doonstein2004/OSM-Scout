import React from 'react';
import { StoreProvider } from './context/StoreContext';
import MainApp from './MainApp';
import './global.css';

export default function App() {
    return (
        <StoreProvider>
            <MainApp />
        </StoreProvider>
    );
}
