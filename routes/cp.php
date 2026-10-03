<?php

use Illuminate\Support\Facades\Route;
use Vizuall\UploadVideo\Http\UploadController;

Route::post('upload-video/apply', [UploadController::class, 'apply'])->name('upload-video.apply');
Route::post('upload-video/poster', [UploadController::class, 'posterAsset'])->name('upload-video.poster-asset');
