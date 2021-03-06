<?php
/**
 * Copyright © MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Alexey Portnov, 2 2020
 */

namespace PhpSchool\TerminalTest\IO;

use PhpSchool\Terminal\IO\ResourceOutputStream;
use PHPUnit\Framework\TestCase;

/**
 * @author Aydin Hassan <aydin@hotmail.co.uk>
 */
class ResourceOutputStreamTest extends TestCase
{
    public function testNonStream() : void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Expected a valid stream');
        new ResourceOutputStream(42);
    }

    public function testNotWritable() : void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Expected a writable stream');
        new ResourceOutputStream(\STDIN);
    }

    public function testWrite() : void
    {
        $stream = fopen('php://memory', 'r+');
        $outputStream = new ResourceOutputStream($stream);
        $outputStream->write('123456789');

        rewind($stream);
        static::assertEquals('123456789', stream_get_contents($stream));
    }
}
