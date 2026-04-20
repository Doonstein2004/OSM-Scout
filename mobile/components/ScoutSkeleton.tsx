import React from 'react';
import { View } from 'react-native';
import { Skeleton, Card } from 'heroui-native';

export const ScoutSkeleton = () => {
    return (
        <View className="gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
                <Card key={i} className="bg-white/5 border border-white/10 rounded-[32px] p-5">
                    <View className="flex-row justify-between mb-4">
                        <View className="flex-row items-center flex-1">
                            {/* OVR Box */}
                            <Skeleton className="w-12 h-12 rounded-2xl mr-4" />
                            <View className="gap-2">
                                {/* Name */}
                                <Skeleton className="w-32 h-5 rounded-full" />
                                {/* Detail Line */}
                                <Skeleton className="w-24 h-3 rounded-full" />
                            </View>
                        </View>
                        {/* Action Area */}
                        <Skeleton className="w-10 h-10 rounded-full" />
                    </View>
                    
                    {/* Bottom Stats Row */}
                    <View className="flex-row justify-between items-center pt-4 border-t border-white/5">
                        <View className="flex-row gap-4">
                            <Skeleton className="w-12 h-3 rounded-full" />
                            <Skeleton className="w-12 h-3 rounded-full" />
                        </View>
                        <Skeleton className="w-16 h-5 rounded-full" />
                    </View>
                </Card>
            ))}
        </View>
    );
};
