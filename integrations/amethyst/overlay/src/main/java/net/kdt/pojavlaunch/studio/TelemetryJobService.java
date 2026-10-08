package net.kdt.pojavlaunch.studio;

import android.app.job.JobParameters;
import android.app.job.JobService;

public final class TelemetryJobService extends JobService {
    @Override public boolean onStartJob(JobParameters params) {
        try {
            Telemetry.register(getApplication(),new StudioApi(this));
            Telemetry.sendInBackground(remaining->jobFinished(params,remaining));
            return true;
        }catch(Exception unavailable){return false;}
    }
    @Override public boolean onStopJob(JobParameters params){return true;}
}
