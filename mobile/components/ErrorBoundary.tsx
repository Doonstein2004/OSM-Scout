import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>⚠️</Text>
            </View>
            <Text style={styles.title}>¡UPS! ALGO SALIÓ MAL</Text>
            <Text style={styles.message}>
              La aplicación encontró un error inesperado al procesar los datos.
            </Text>
            {__DEV__ && (
              <View style={styles.debugBox}>
                <Text style={styles.debugText}>{this.state.error?.toString()}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.button} onPress={this.handleReset}>
              <Text style={styles.buttonText}>REINTENTAR</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 30,
    backgroundColor: '#ef444420',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 20,
    width: '100%',
  },
  buttonText: {
    color: 'black',
    fontWeight: '900',
    textAlign: 'center',
    fontSize: 16,
  },
  debugBox: {
    backgroundColor: '#1e293b',
    padding: 15,
    borderRadius: 15,
    marginBottom: 20,
    width: '100%',
  },
  debugText: {
    color: '#ef4444',
    fontFamily: 'monospace',
    fontSize: 12,
  }
});
